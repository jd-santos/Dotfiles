#!/usr/bin/env bash
set -euo pipefail

usage() {
	cat <<'EOF'
Usage:
  sync-tracked-skill.sh <tracking-repo> <source-path> [skill-name]

Copies a skill directory from .agents/tracking/ into .agents/skills/.
If the skill points at shared files like ../../references/, the script copies
those into the exposed skill directory and rewrites the paths to stay local.

Examples:
  sync-tracked-skill.sh informed-patient informed-patient/skills/informed-patient
  sync-tracked-skill.sh my-upstream path/to/skill custom-skill-name
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
	usage
	exit 0
fi

if [[ $# -lt 2 || $# -gt 3 ]]; then
	usage >&2
	exit 1
fi

tracking_repo="$1"
source_path="$2"
skill_name="${3:-$(basename "$source_path")}"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
agent_root="$(cd "$script_dir/../../.." && pwd)"
source_dir="$agent_root/tracking/$tracking_repo/$source_path"
source_package_root="$(cd "$source_dir/../.." && pwd 2>/dev/null || true)"
target_dir="$agent_root/skills/$skill_name"

if [[ ! -d "$source_dir" ]]; then
	echo "Missing tracked skill source: $source_dir" >&2
	exit 1
fi

if [[ ! -f "$source_dir/SKILL.md" ]]; then
	echo "Source does not look like a skill directory: $source_dir" >&2
	exit 1
fi

if [[ -e "$target_dir" ]]; then
	echo "Replacing existing exposed skill: $target_dir"
	rm -rf "$target_dir"
fi

mkdir -p "$(dirname "$target_dir")"
cp -R "$source_dir" "$target_dir"

skill_md="$target_dir/SKILL.md"
shared_paths="$(grep -oE '\.\./\.\./[A-Za-z0-9._-]+/' "$skill_md" | sed -E 's#\.\./\.\./([^/]+)/#\1#' | sort -u || true)"

if [[ -n "$shared_paths" && -n "$source_package_root" ]]; then
	while IFS= read -r shared_name; do
		[[ -z "$shared_name" ]] && continue
		shared_source="$source_package_root/$shared_name"
		shared_target="$target_dir/$shared_name"

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

echo "Synced tracked skill"
echo "  from: $source_dir"
echo "  to:   $target_dir"
if [[ -n "$shared_paths" ]]; then
	echo "  localized shared paths: $(echo "$shared_paths" | tr '\n' ' ' | xargs)"
fi
echo
echo "Next steps:"
echo "  1. Review $target_dir"
echo "  2. Update $agent_root/TRACKED-SKILLS.md"
echo "  3. Run: stow -R agents"
