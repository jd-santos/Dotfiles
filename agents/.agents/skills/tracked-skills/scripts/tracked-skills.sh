#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
agents_root="$(cd "$script_dir/../../.." && pwd)"
manifest="$agents_root/tracked-skills.json"
repo_root="$(git -C "$agents_root" rev-parse --show-toplevel 2>/dev/null || true)"
exec 3<&0

TEMP_DIR=""
REPO_STASH_ACTIVE=0
REPO_STASH_NAME=""

cleanup() {
	local exit_code=$?

	if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
		rm -rf "$TEMP_DIR"
	fi

	if [[ "$REPO_STASH_ACTIVE" -eq 1 && -n "$repo_root" ]]; then
		echo
		echo "Restoring stashed local changes"
		if ! git -C "$repo_root" stash pop >/dev/null; then
			echo "Warning: could not cleanly restore stashed changes. Resolve them manually." >&2
		fi
	fi

	trap - EXIT
	exit "$exit_code"
}
trap cleanup EXIT

die() {
	echo "$*" >&2
	exit 1
}

usage() {
	cat <<'EOF'
Usage:
  tracked-skills.sh [update]
  tracked-skills.sh add <repo-url> [ref] [options]
  tracked-skills.sh sync [all|tracking-repo]
  tracked-skills.sh sync-one <tracking-repo> <source-path> [skill-name]

Commands:
  update    Fetch all tracked upstream repos, show reviewable diffs, ask before
            pulling subtree updates, then sync exposed skills and update the
            manifest. This is the default command.
  add       Add one tracked repo to .agents/tracking/, scan it for SKILL.md
            directories, let you choose one or more skills, sync them into
            .agents/skills/, and update tracked-skills.json.
  sync      Sync exposed skills from tracked snapshots without contacting
            upstream. Use `all` or a specific tracking repo name.
  sync-one  Internal helper for syncing one skill directory.

Options for `add`:
  --ref <ref>                Branch or tag to track
  --tracking-repo <name>     Directory name under .agents/tracking/
  --source-path <path>       Skill directory inside the tracked repo
                             (repeatable)
  --restow                   Run `stow -R agents` after syncing
  --no-restow                Skip `stow -R agents`
  --commit                   Create a git commit after syncing
  --no-commit                Skip commit creation
EOF
}

require_manifest() {
	[[ -f "$manifest" ]] || die "Missing manifest: $manifest"
}

require_repo() {
	[[ -n "$repo_root" ]] || die "This command requires a git repo checkout. Run it from your dotfiles repo, not only from ~/.agents/."
}

ensure_temp_dir() {
	if [[ -z "$TEMP_DIR" || ! -d "$TEMP_DIR" ]]; then
		TEMP_DIR="$(mktemp -d)"
	fi
}

prompt() {
	local message="$1"
	printf "%s" "$message" >&2
	read -r reply <&3
	printf "%s" "$reply"
}

prompt_with_default() {
	local message="$1"
	local default_value="$2"
	local reply

	reply="$(prompt "$message")"
	if [[ -z "$reply" ]]; then
		printf "%s" "$default_value"
	else
		printf "%s" "$reply"
	fi
}

confirm() {
	local message="$1"
	local default_answer="${2:-N}"
	local reply

	while true; do
		reply="$(prompt "$message")"
		if [[ -z "$reply" ]]; then
			reply="$default_answer"
		fi

		case "$reply" in
		y | Y | yes | YES)
			return 0
			;;
		n | N | no | NO)
			return 1
			;;
		esac

		echo "Enter y or n." >&2
	done
}

is_dirty_repo() {
	[[ -n "$(git -C "$repo_root" status --short)" ]]
}

stash_repo_if_needed() {
	if ! is_dirty_repo; then
		return 0
	fi

	if ! confirm "Repo has local changes. Stash them before continuing? [y/N] " "N"; then
		die "This operation needs a clean worktree. Commit or stash your changes, then rerun the script."
	fi

	REPO_STASH_NAME="tracked-skills-$(date +%s)"
	git -C "$repo_root" stash push --include-untracked -m "$REPO_STASH_NAME" >/dev/null
	REPO_STASH_ACTIVE=1
}

restore_repo_stash_now() {
	if [[ "$REPO_STASH_ACTIVE" -ne 1 ]]; then
		return 0
	fi

	echo
	echo "Restoring stashed local changes"
	if ! git -C "$repo_root" stash pop >/dev/null; then
		echo "Warning: could not cleanly restore stashed changes. Resolve them manually." >&2
	fi
	REPO_STASH_ACTIVE=0
	REPO_STASH_NAME=""
}

repo_slug() {
	local repo="$1"
	local slug="${repo##*/}"
	slug="${slug%.git}"
	printf "%s" "$slug"
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

append_manifest_entries() {
	local entries_file="$1"
	local repo="$2"
	local ref="$3"
	local tracking_repo="$4"
	local commit="$5"
	local synced_at="$6"

	python3 - "$manifest" "$entries_file" "$repo" "$ref" "$tracking_repo" "$commit" "$synced_at" <<'PY'
import json
import sys
from pathlib import Path

manifest_path = Path(sys.argv[1])
entries_path = Path(sys.argv[2])
repo = sys.argv[3]
ref = sys.argv[4]
tracking_repo = sys.argv[5]
commit = sys.argv[6]
synced_at = sys.argv[7]

data = json.loads(manifest_path.read_text())
tracked = data.setdefault("tracked_skills", [])
existing = {
    (entry["tracking_repo"], entry["source_path"], entry.get("skill_name") or entry["name"])
    for entry in tracked
}

for raw_line in entries_path.read_text().splitlines():
    if not raw_line.strip():
        continue
    name, source_path, skill_name = raw_line.split("\t", 2)
    key = (tracking_repo, source_path, skill_name)
    if key in existing:
        continue
    tracked.append(
        {
            "name": name,
            "repo": repo,
            "ref": ref,
            "tracking_repo": tracking_repo,
            "source_path": source_path,
            "skill_name": skill_name,
            "last_synced_commit": commit,
            "last_synced_at": synced_at,
        }
    )
    existing.add(key)

manifest_path.write_text(json.dumps(data, indent=2) + "\n")
PY
}

find_tracking_repo_record_for_repo() {
	local repo="$1"
	local ref="$2"
	local entry_tracking_repo
	local entry_repo
	local entry_ref
	local entry_commit

	while IFS=$'\t' read -r entry_tracking_repo entry_repo entry_ref entry_commit; do
		[[ -z "$entry_tracking_repo" ]] && continue
		if [[ "$entry_repo" == "$repo" && "$entry_ref" == "$ref" ]]; then
			printf '%s\t%s\n' "$entry_tracking_repo" "$entry_commit"
			return 0
		fi
	done < <(list_tracking_repos)

	return 1
}

tracking_repo_conflicts() {
	local tracking_repo="$1"
	local repo="$2"
	local ref="$3"

	while IFS=$'\t' read -r existing_tracking_repo existing_repo existing_ref _; do
		[[ -z "$existing_tracking_repo" ]] && continue
		if [[ "$existing_tracking_repo" == "$tracking_repo" ]]; then
			if [[ "$existing_repo" == "$repo" && "$existing_ref" == "$ref" ]]; then
				return 1
			fi
			return 0
		fi
	done < <(list_tracking_repos)

	return 1
}

manifest_skill_name_for_source() {
	local tracking_repo="$1"
	local source_path="$2"
	python3 - "$manifest" "$tracking_repo" "$source_path" <<'PY'
import json
import sys

with open(sys.argv[1]) as f:
    data = json.load(f)

tracking_repo = sys.argv[2]
source_path = sys.argv[3]
for entry in data.get("tracked_skills", []):
    if entry["tracking_repo"] == tracking_repo and entry["source_path"] == source_path:
        print(entry.get("skill_name") or entry["name"])
        break
PY
}

manifest_source_for_skill_name() {
	local skill_name="$1"
	python3 - "$manifest" "$skill_name" <<'PY'
import json
import sys

with open(sys.argv[1]) as f:
    data = json.load(f)

skill_name = sys.argv[2]
for entry in data.get("tracked_skills", []):
    candidate = entry.get("skill_name") or entry["name"]
    if candidate == skill_name:
        print("\t".join([entry["tracking_repo"], entry["source_path"]]))
        break
PY
}

scan_skills_in_dir() {
	local root_dir="$1"
	local output_file="$2"

	python3 - "$root_dir" <<'PY' >"$output_file"
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
rows = []

for skill_md in sorted(root.rglob("SKILL.md")):
    skill_dir = skill_md.parent
    rel = skill_dir.relative_to(root).as_posix()
    name = skill_dir.name

    try:
        text = skill_md.read_text()
    except UnicodeDecodeError:
        text = skill_md.read_text(errors="ignore")

    if text.startswith("---\n"):
        frontmatter, _, _ = text[4:].partition("\n---\n")
        for line in frontmatter.splitlines():
            if line.startswith("name:"):
                candidate = line.split(":", 1)[1].strip().strip('"\'')
                if candidate:
                    name = candidate
                break

    rows.append((rel, name))

for rel, name in rows:
    print(f"{rel}\t{name}")
PY
}

print_scanned_skills() {
	local scan_file="$1"
	local index=1

	while IFS=$'\t' read -r source_path skill_name; do
		[[ -z "$source_path" ]] && continue
		printf '%s) %s [%s]\n' "$index" "$skill_name" "$source_path"
		index=$((index + 1))
	done <"$scan_file"
}

select_scanned_skills() {
	local scan_file="$1"
	local selection="$2"
	local output_file="$3"

	python3 - "$scan_file" "$selection" <<'PY' >"$output_file"
import sys
from pathlib import Path

scan_path = Path(sys.argv[1])
selection = sys.argv[2].strip()
rows = [line.rstrip("\n") for line in scan_path.read_text().splitlines() if line.strip()]

if not rows:
    raise SystemExit("No skills found")

if selection.lower() == "all":
    print("\n".join(rows))
    raise SystemExit(0)

indices = []
seen = set()
for part in selection.split(","):
    part = part.strip()
    if not part:
        continue
    if not part.isdigit():
        raise SystemExit(f"Invalid selection: {part}")
    idx = int(part)
    if idx < 1 or idx > len(rows):
        raise SystemExit(f"Selection out of range: {idx}")
    if idx not in seen:
        seen.add(idx)
        indices.append(idx)

if not indices:
    raise SystemExit("No skills selected")

for idx in indices:
    print(rows[idx - 1])
PY
}

select_skills_by_path() {
	local scan_file="$1"
	local output_file="$2"
	shift 2

	python3 - "$scan_file" "$output_file" "$@" <<'PY'
import sys
from pathlib import Path

scan_path = Path(sys.argv[1])
out_path = Path(sys.argv[2])
requested = sys.argv[3:]
rows = {}
ordered = []
for raw_line in scan_path.read_text().splitlines():
    if not raw_line.strip():
        continue
    source_path, skill_name = raw_line.split("\t", 1)
    rows[source_path] = raw_line
    ordered.append(source_path)

missing = [path for path in requested if path not in rows]
if missing:
    raise SystemExit("Unknown source path(s): " + ", ".join(missing))

seen = set()
selected = []
for path in requested:
    if path in seen:
        continue
    seen.add(path)
    selected.append(rows[path])

out_path.write_text("\n".join(selected) + ("\n" if selected else ""))
PY
}

prompt_for_tracking_repo() {
	local default_value="$1"
	local repo="$2"
	local ref="$3"
	local candidate

	while true; do
		candidate="$(prompt_with_default "Tracking repo directory [$default_value]: " "$default_value")"
		[[ -n "$candidate" ]] || continue

		if tracking_repo_conflicts "$candidate" "$repo" "$ref"; then
			echo "Tracking repo '$candidate' is already used for a different upstream repo." >&2
			continue
		fi

		local tracking_dir="$agents_root/tracking/$candidate"
		if [[ -e "$tracking_dir" ]]; then
			echo "Tracking path already exists: $tracking_dir" >&2
			continue
		fi

		printf "%s" "$candidate"
		return 0
	done
}

prompt_for_skill_name() {
	local default_value="$1"
	local tracking_repo="$2"
	local source_path="$3"
	local candidate="$default_value"
	local conflict

	while true; do
		candidate="$(prompt_with_default "Exposed skill name for $source_path [$candidate]: " "$candidate")"
		[[ -n "$candidate" ]] || continue

		conflict="$(manifest_source_for_skill_name "$candidate")"
		if [[ -z "$conflict" || "$conflict" == "$tracking_repo"$'\t'"$source_path" ]]; then
			printf "%s" "$candidate"
			return 0
		fi

		echo "Skill name '$candidate' is already used by ${conflict%%$'\t'*} (${conflict#*$'\t'})." >&2
	done
}

clone_repo_for_scan() {
	local repo="$1"
	local ref="$2"
	local target_dir="$3"

	git clone --quiet --depth 1 --branch "$ref" "$repo" "$target_dir" >/dev/null 2>&1 ||
		git clone --quiet --depth 1 "$repo" "$target_dir" >/dev/null 2>&1 || die "Could not clone $repo"

	if ! git -C "$target_dir" rev-parse --verify "$ref" >/dev/null 2>&1; then
		git -C "$target_dir" fetch --quiet origin "$ref"
		git -C "$target_dir" checkout --quiet FETCH_HEAD
	fi
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
		done <<<"$shared_paths"
	fi

	echo "Synced $skill_name from $tracking_repo"
}

sync_entries_file() {
	local tracking_repo="$1"
	local entries_file="$2"

	while IFS=$'\t' read -r _ source_path skill_name; do
		[[ -z "$source_path" ]] && continue
		sync_one_entry "$tracking_repo" "$source_path" "$skill_name"
	done <"$entries_file"
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

	if confirm "View full diff for $tracking_repo? [y/N] " "N"; then
		show_full_diff "$local_dir" "$upstream_dir"
	fi

	while true; do
		local action
		action="$(prompt "Apply upstream update for $tracking_repo? [y]es/[n]o/[q]uit: ")"
		case "$action" in
		y | Y | yes | YES)
			REVIEW_DECISION="apply"
			return 0
			;;
		n | N | no | NO | "")
			REVIEW_DECISION="skip"
			return 0
			;;
		q | Q | quit | QUIT)
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
		if confirm "Repo has local changes. Stash them before applying updates? [y/N] " "N"; then
			git -C "$repo_root" stash push --include-untracked -m "$stash_name" >/dev/null
			stashed=1
		else
			die "Apply phase needs a clean worktree. Commit or stash your changes, then rerun the script."
		fi
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
	done <"$approved_file"

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
	ensure_temp_dir

	local approved_file="$TEMP_DIR/approved.tsv"
	: >"$approved_file"
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
		local upstream_dir="$TEMP_DIR/$tracking_repo"
		mkdir -p "$upstream_dir"
		git -C "$repo_root" archive "$upstream_commit" | tar -x -C "$upstream_dir"

		if [[ ! -d "$local_dir" ]]; then
			mkdir -p "$local_dir"
		fi

		review_repo_update "$tracking_repo" "$repo" "$ref" "$current_commit" "$upstream_commit" "$local_dir" "$upstream_dir"
		case "$REVIEW_DECISION" in
		apply)
			printf '%s\t%s\t%s\t%s\n' "$tracking_repo" "$repo" "$ref" "$upstream_commit" >>"$approved_file"
			;;
		quit)
			review_stopped=1
			break
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
}

stage_add_commit() {
	local tracking_repo="$1"
	local entries_file="$2"

	git -C "$repo_root" add "agents/.agents/tracked-skills.json"
	if [[ -d "$agents_root/tracking/$tracking_repo" ]]; then
		git -C "$repo_root" add "agents/.agents/tracking/$tracking_repo"
	fi

	while IFS=$'\t' read -r _ _ skill_name; do
		[[ -z "$skill_name" ]] && continue
		git -C "$repo_root" add "agents/.agents/skills/$skill_name"
	done <"$entries_file"
}

run_add() {
	require_manifest
	require_repo
	ensure_temp_dir

	local repo=""
	local ref="main"
	local ref_set=0
	local tracking_repo=""
	local restow_mode="ask"
	local commit_mode="ask"
	local -a source_paths=()

	while [[ $# -gt 0 ]]; do
		case "$1" in
		--ref)
			[[ $# -ge 2 ]] || die "--ref needs a value"
			ref="$2"
			ref_set=1
			shift 2
			;;
		--tracking-repo)
			[[ $# -ge 2 ]] || die "--tracking-repo needs a value"
			tracking_repo="$2"
			shift 2
			;;
		--source-path)
			[[ $# -ge 2 ]] || die "--source-path needs a value"
			source_paths+=("$2")
			shift 2
			;;
		--restow)
			restow_mode="yes"
			shift
			;;
		--no-restow)
			restow_mode="no"
			shift
			;;
		--commit)
			commit_mode="yes"
			shift
			;;
		--no-commit)
			commit_mode="no"
			shift
			;;
		-h | --help)
			usage
			return 0
			;;
		*)
			if [[ -z "$repo" ]]; then
				repo="$1"
			elif [[ $ref_set -eq 0 ]]; then
				ref="$1"
				ref_set=1
			else
				die "Unknown argument: $1"
			fi
			shift
			;;
		esac
	done

	[[ -n "$repo" ]] || die "add needs a repo URL"

	local existing_record=""
	if existing_record="$(find_tracking_repo_record_for_repo "$repo" "$ref")"; then
		local existing_tracking_repo="${existing_record%%$'\t'*}"
		local existing_commit="${existing_record#*$'\t'}"
		if [[ -n "$tracking_repo" && "$tracking_repo" != "$existing_tracking_repo" ]]; then
			die "Repo is already tracked as '$existing_tracking_repo'. Use that tracking repo name."
		fi
		tracking_repo="$existing_tracking_repo"
		echo "Repo already tracked as $tracking_repo. Scanning the local tracked snapshot."
	else
		local repo_scan_dir="$TEMP_DIR/repo-scan"
		clone_repo_for_scan "$repo" "$ref" "$repo_scan_dir"
		local existing_tracking_repo=""
		local existing_commit="$(git -C "$repo_scan_dir" rev-parse HEAD)"
		local default_tracking_repo
		default_tracking_repo="$(repo_slug "$repo")"
		if [[ -z "$tracking_repo" ]]; then
			tracking_repo="$(prompt_for_tracking_repo "$default_tracking_repo" "$repo" "$ref")"
		elif tracking_repo_conflicts "$tracking_repo" "$repo" "$ref"; then
			die "Tracking repo '$tracking_repo' is already used for a different upstream repo."
		fi
	fi

	local scan_root
	local upstream_commit
	if [[ -d "$agents_root/tracking/$tracking_repo" && -n "$(find_tracking_repo_record_for_repo "$repo" "$ref" || true)" ]]; then
		scan_root="$agents_root/tracking/$tracking_repo"
		upstream_commit="${existing_commit:-}"
		[[ -d "$scan_root" ]] || die "Missing tracked repo snapshot: $scan_root"
	else
		scan_root="$TEMP_DIR/repo-scan"
		upstream_commit="$(git -C "$scan_root" rev-parse HEAD)"
	fi

	local scan_file="$TEMP_DIR/available-skills.tsv"
	scan_skills_in_dir "$scan_root" "$scan_file"
	[[ -s "$scan_file" ]] || die "No SKILL.md files found in $repo"

	echo
	echo "Available skills:"
	print_scanned_skills "$scan_file"

	local selected_file="$TEMP_DIR/selected-skills.tsv"
	if [[ ${#source_paths[@]} -gt 0 ]]; then
		select_skills_by_path "$scan_file" "$selected_file" "${source_paths[@]}"
	else
		local skill_count
		skill_count="$(wc -l <"$scan_file" | tr -d ' ')"
		local default_selection="all"
		if [[ "$skill_count" == "1" ]]; then
			default_selection="1"
		fi

		while true; do
			local selection
			selection="$(prompt_with_default "Select skills to track [$default_selection]: " "$default_selection")"
			if select_scanned_skills "$scan_file" "$selection" "$selected_file" 2>"$TEMP_DIR/select-error.log"; then
				break
			fi
			cat "$TEMP_DIR/select-error.log" >&2
		done
	fi

	local entries_file="$TEMP_DIR/new-entries.tsv"
	: >"$entries_file"
	local added_count=0

	while IFS=$'\t' read -r source_path discovered_name; do
		[[ -z "$source_path" ]] && continue

		local existing_skill_name
		existing_skill_name="$(manifest_skill_name_for_source "$tracking_repo" "$source_path")"
		if [[ -n "$existing_skill_name" ]]; then
			echo "Already tracked: $source_path -> $existing_skill_name"
			continue
		fi

		local default_skill_name="$discovered_name"
		if [[ -z "$default_skill_name" ]]; then
			default_skill_name="$(basename "$source_path")"
		fi

		local skill_name
		skill_name="$(prompt_for_skill_name "$default_skill_name" "$tracking_repo" "$source_path")"
		printf '%s\t%s\t%s\n' "$discovered_name" "$source_path" "$skill_name" >>"$entries_file"
		added_count=$((added_count + 1))
	done <"$selected_file"

	if [[ "$added_count" -eq 0 ]]; then
		echo "No new tracked skills selected."
		return 0
	fi

	local new_tracking_repo=0
	if ! find_tracking_repo_record_for_repo "$repo" "$ref" >/dev/null 2>&1; then
		new_tracking_repo=1
	fi

	stash_repo_if_needed

	if [[ "$new_tracking_repo" -eq 1 ]]; then
		echo
		echo "Adding subtree for $tracking_repo"
		git -C "$repo_root" subtree add \
			--prefix="agents/.agents/tracking/$tracking_repo" \
			"$repo" \
			"$ref" \
			--squash \
			-m "chore(agents): track $tracking_repo upstream"
	fi

	append_manifest_entries "$entries_file" "$repo" "$ref" "$tracking_repo" "$upstream_commit" "$(date +%F)"
	sync_entries_file "$tracking_repo" "$entries_file"

	local should_restow=1
	case "$restow_mode" in
	no)
		should_restow=0
		;;
	yes)
		should_restow=1
		;;
	ask)
		if confirm "Run stow -R agents now? [y/N] " "N"; then
			should_restow=1
		else
			should_restow=0
		fi
		;;
	esac

	if [[ "$should_restow" -eq 1 ]]; then
		(
			cd "$repo_root"
			stow -R agents
		)
	fi

	local should_commit=1
	case "$commit_mode" in
	no)
		should_commit=0
		;;
	yes)
		should_commit=1
		;;
	ask)
		if confirm "Create a git commit now? [y/N] " "N"; then
			should_commit=1
		else
			should_commit=0
		fi
		;;
	esac

	if [[ "$should_commit" -eq 1 ]]; then
		stage_add_commit "$tracking_repo" "$entries_file"
		git -C "$repo_root" commit -m "feat(agents): track $tracking_repo skills"
	fi

	echo
	echo "Tracked skills added from $tracking_repo:"
	cut -f3 "$entries_file"

	restore_repo_stash_now
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
		shift || true
		run_update "$@"
		;;
	add)
		shift || true
		run_add "$@"
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
	-h | --help | help)
		usage
		;;
	*)
		usage >&2
		exit 1
		;;
	esac
}

main "$@"
