#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
agents_root="$(cd "$script_dir/../../.." && pwd)"
manifest="$agents_root/tracked-skills.json"
repo_root="$(git -C "$agents_root" rev-parse --show-toplevel 2>/dev/null || true)"

die() {
  echo "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage:
  tracked-skills.sh [update]
  tracked-skills.sh sync [all|tracking-repo]
  tracked-skills.sh sync-one <tracking-repo> <source-path> [skill-name]

Commands:
  update    Fetch all tracked upstream repos, show reviewable diffs, ask before
            pulling subtree updates, then sync exposed skills and update the
            manifest. This is the default command.
  sync      Sync exposed skills from tracked snapshots without contacting
            upstream. Use `all` or a specific tracking repo name.
  sync-one  Internal helper for syncing one skill directory.
EOF
}

require_manifest() {
  [[ -f "$manifest" ]] || die "Missing manifest: $manifest"
}

require_repo() {
  [[ -n "$repo_root" ]] || die "Update requires a git repo checkout. Run this from your dotfiles repo, not only from ~/.agents/."
}

prompt() {
  local message="$1"
  printf "%s" "$message" >&2
  read -r reply
  printf "%s" "$reply"
}

is_dirty_repo() {
  [[ -n "$(git -C "$repo_root" status --short)" ]]
}

list_tracking_repos() {
  python3 - "$manifest" <<'PY'
import json
import sys
from collections import OrderedDict

with open(sys.argv[1]) as f:
    data = json.load(f)

groups = OrderedDict()
for entry in data.get("tracked_skills", []):
    key = entry["tracking_repo"]
    group = groups.setdefault(
        key,
        {
            "tracking_repo": entry["tracking_repo"],
            "repo": entry["repo"],
            "ref": entry.get("ref", "main"),
            "last_synced_commit": entry.get("last_synced_commit", ""),
        },
    )
    if group["repo"] != entry["repo"] or group["ref"] != entry.get("ref", "main"):
        raise SystemExit(f"Manifest mismatch for tracking_repo={key}: repo/ref must match across entries")

for group in groups.values():
    print("\t".join([group["tracking_repo"], group["repo"], group["ref"], group["last_synced_commit"]]))
PY
}

list_entries_for_repo() {
  local tracking_repo="$1"
  python3 - "$manifest" "$tracking_repo" <<'PY'
import json
import sys

with open(sys.argv[1]) as f:
    data = json.load(f)

tracking_repo = sys.argv[2]
for entry in data.get("tracked_skills", []):
    if entry["tracking_repo"] == tracking_repo:
        print("\t".join([entry.get("skill_name") or entry["name"], entry["source_path"]]))
PY
}

update_manifest_repo() {
  local tracking_repo="$1"
  local commit="$2"
  local synced_at="$3"
  python3 - "$manifest" "$tracking_repo" "$commit" "$synced_at" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
tracking_repo = sys.argv[2]
commit = sys.argv[3]
synced_at = sys.argv[4]

data = json.loads(path.read_text())
for entry in data.get("tracked_skills", []):
    if entry["tracking_repo"] == tracking_repo:
        entry["last_synced_commit"] = commit
        entry["last_synced_at"] = synced_at

path.write_text(json.dumps(data, indent=2) + "\n")
PY
}

sync_one_entry() {
  local tracking_repo="$1"
  local source_path="$2"
  local skill_name="${3:-$(basename "$source_path")}"
  local source_dir="$agents_root/tracking/$tracking_repo/$source_path"
  local source_package_root
  local target_dir="$agents_root/skills/$skill_name"

  source_package_root="$(cd "$source_dir/../.." && pwd 2>/dev/null || true)"

  [[ -d "$source_dir" ]] || die "Missing tracked skill source: $source_dir"
  [[ -f "$source_dir/SKILL.md" ]] || die "Source does not look like a skill directory: $source_dir"

  if [[ -e "$target_dir" ]]; then
    rm -rf "$target_dir"
  fi

  mkdir -p "$(dirname "$target_dir")"
  cp -R "$source_dir" "$target_dir"

  local skill_md="$target_dir/SKILL.md"
  local shared_paths
  shared_paths="$(grep -oE '\.\./\.\./[A-Za-z0-9._-]+/' "$skill_md" | sed -E 's#\.\./\.\./([^/]+)/#\1#' | sort -u || true)"

  if [[ -n "$shared_paths" && -n "$source_package_root" ]]; then
    while IFS= read -r shared_name; do
      [[ -z "$shared_name" ]] && continue
      local shared_source="$source_package_root/$shared_name"
      local shared_target="$target_dir/$shared_name"

      if [[ -d "$shared_source" ]]; then
        rm -rf "$shared_target"
        cp -R "$shared_source" "$shared_target"
      elif [[ -f "$shared_source" ]]; then
        mkdir -p "$(dirname "$shared_target")"
        cp "$shared_source" "$shared_target"
      else
        echo "Warning: missing shared path referenced by SKILL.md: $shared_source" >&2
        continue
      fi

      python3 - "$skill_md" "$shared_name" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
name = sys.argv[2]
text = path.read_text()
text = text.replace(f"../../{name}/", f"{name}/")
path.write_text(text)
PY
    done <<< "$shared_paths"
  fi

  echo "Synced $skill_name from $tracking_repo"
}

sync_repo_entries() {
  local tracking_repo="$1"
  while IFS=$'\t' read -r skill_name source_path; do
    [[ -z "$skill_name" ]] && continue
    sync_one_entry "$tracking_repo" "$source_path" "$skill_name"
  done < <(list_entries_for_repo "$tracking_repo")
}

show_full_diff() {
  local local_dir="$1"
  local upstream_dir="$2"
  if command -v less >/dev/null 2>&1; then
    git --no-pager diff --no-index -- "$local_dir" "$upstream_dir" | less -R || true
  else
    git --no-pager diff --no-index -- "$local_dir" "$upstream_dir" || true
  fi
}

REVIEW_DECISION=""

review_repo_update() {
  local tracking_repo="$1"
  local repo="$2"
  local ref="$3"
  local current_commit="$4"
  local upstream_commit="$5"
  local local_dir="$6"
  local upstream_dir="$7"

  echo
  echo "=== $tracking_repo ==="
  echo "Repo: $repo"
  echo "Ref:  $ref"
  echo "Last synced: ${current_commit:-unknown}"
  echo "Upstream:    $upstream_commit"
  echo
  echo "Commits since last sync:"
  if [[ -n "$current_commit" ]]; then
    git --no-pager log --oneline --no-decorate "$current_commit..$upstream_commit" || true
  else
    git --no-pager log --oneline --no-decorate -10 "$upstream_commit" || true
  fi
  echo
  echo "Diff stat:"
  git --no-pager diff --stat --no-index -- "$local_dir" "$upstream_dir" || true
  echo

  local view_diff
  view_diff="$(prompt "View full diff for $tracking_repo? [y/N] ")"
  case "$view_diff" in
    y|Y|yes|YES)
      show_full_diff "$local_dir" "$upstream_dir"
      ;;
  esac

  local action
  while true; do
    action="$(prompt "Apply upstream update for $tracking_repo? [y]es/[n]o/[q]uit: ")"
    case "$action" in
      y|Y|yes|YES)
        REVIEW_DECISION="apply"
        return 0
        ;;
      n|N|no|NO|"")
        REVIEW_DECISION="skip"
        return 0
        ;;
      q|Q|quit|QUIT)
        REVIEW_DECISION="quit"
        return 0
        ;;
      *)
        echo "Enter y, n, or q." >&2
        ;;
    esac
  done
}

apply_updates() {
  local approved_file="$1"

  local stash_name="tracked-skills-pre-update-$(date +%s)"
  local stashed=0

  if is_dirty_repo; then
    local stash_reply
    stash_reply="$(prompt "Repo has local changes. Stash them before applying updates? [y/N] ")"
    case "$stash_reply" in
      y|Y|yes|YES)
        git -C "$repo_root" stash push --include-untracked -m "$stash_name" >/dev/null
        stashed=1
        ;;
      *)
        die "Apply phase needs a clean worktree. Commit or stash your changes, then rerun the script."
        ;;
    esac
  fi

  local synced_at
  synced_at="$(date +%F)"

  while IFS=$'\t' read -r tracking_repo repo ref commit; do
    [[ -z "$tracking_repo" ]] && continue

    echo
    echo "Pulling subtree for $tracking_repo"
    git -C "$repo_root" subtree pull \
      --prefix="agents/.agents/tracking/$tracking_repo" \
      "$repo" \
      "$ref" \
      --squash \
      -m "chore(agents): update $tracking_repo upstream"

    sync_repo_entries "$tracking_repo"
    update_manifest_repo "$tracking_repo" "$commit" "$synced_at"
  done < "$approved_file"

  if [[ $stashed -eq 1 ]]; then
    echo
    echo "Restoring stashed local changes"
    if ! git -C "$repo_root" stash pop >/dev/null; then
      echo "Warning: could not cleanly restore stashed changes. Resolve them manually." >&2
    fi
  fi
}

run_update() {
  require_manifest
  require_repo

  local tmpdir
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "${tmpdir:-}"' EXIT

  local approved_file="$tmpdir/approved.tsv"
  : > "$approved_file"
  local review_stopped=0

  while IFS=$'\t' read -r tracking_repo repo ref current_commit; do
    [[ -z "$tracking_repo" ]] && continue

    local fetch_ref="refs/pi-tracked-skills/$tracking_repo"
    git -C "$repo_root" fetch --quiet "$repo" "$ref:$fetch_ref"
    local upstream_commit
    upstream_commit="$(git -C "$repo_root" rev-parse "$fetch_ref")"

    if [[ "$upstream_commit" == "$current_commit" ]]; then
      echo "$tracking_repo is up to date ($upstream_commit)"
      continue
    fi

    local local_dir="$agents_root/tracking/$tracking_repo"
    local upstream_dir="$tmpdir/$tracking_repo"
    mkdir -p "$upstream_dir"
    git -C "$repo_root" archive "$upstream_commit" | tar -x -C "$upstream_dir"

    if [[ ! -d "$local_dir" ]]; then
      mkdir -p "$local_dir"
    fi

    review_repo_update "$tracking_repo" "$repo" "$ref" "$current_commit" "$upstream_commit" "$local_dir" "$upstream_dir"
    case "$REVIEW_DECISION" in
      apply)
        printf '%s\t%s\t%s\t%s\n' "$tracking_repo" "$repo" "$ref" "$upstream_commit" >> "$approved_file"
        ;;
      quit)
        review_stopped=1
        break
        ;;
      *)
        ;;
    esac
  done < <(list_tracking_repos)

  if [[ ! -s "$approved_file" ]]; then
    if [[ $review_stopped -eq 1 ]]; then
      echo "Stopped after review. No updates applied."
    else
      echo "No approved updates."
    fi
    return 0
  fi

  apply_updates "$approved_file"

  echo
  echo "Updated tracked skills:"
  cut -f1 "$approved_file"
  echo "Review changes, then commit them when ready."

  rm -rf "$tmpdir"
  trap - EXIT
}

run_sync() {
  require_manifest
  local target="${1:-all}"

  if [[ "$target" == "all" ]]; then
    while IFS=$'\t' read -r tracking_repo _; do
      [[ -z "$tracking_repo" ]] && continue
      sync_repo_entries "$tracking_repo"
    done < <(list_tracking_repos)
  else
    sync_repo_entries "$target"
  fi
}

main() {
  local command="${1:-update}"
  case "$command" in
    update)
      run_update
      ;;
    sync)
      shift || true
      run_sync "${1:-all}"
      ;;
    sync-one)
      shift || true
      [[ $# -ge 2 && $# -le 3 ]] || die "sync-one needs <tracking-repo> <source-path> [skill-name]"
      sync_one_entry "$@"
      ;;
    -h|--help|help)
      usage
      ;;
    *)
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
