#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
script="$repo/bin/bin/merge-settings"
fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT
home="$fixture/home"
app="$home/.config/herdr-app"
mkdir -p "$app"
printf '%s\n' '{"theme":"shared","sounds":{"enabled":false},"zoom":1.2}' > "$app/settings.base.json"
merge() { HOME="$home" HERDR_APP_HOME="$app" "$script" --herdr-app-only >/dev/null; }
hash() { shasum -a 256 "$app/settings.json"; }
file_mode() {
  local mode
  if ! mode="$(stat -f %Lp "$app/settings.json" 2>/dev/null)"; then
    mode="$(stat -c %a "$app/settings.json")"
  fi
  printf '%s\n' "$mode"
}
expect_failure() {
  local before
  before="$(hash)"
  if merge 2>/dev/null; then
    echo 'Expected Herdr App merge to fail' >&2
    exit 1
  fi
  [[ "$(hash)" == "$before" ]]
  [[ -z "$(find "$app" -name 'settings.json.??????' -print)" ]]
}

merge
[[ -f "$app/settings.json" && ! -L "$app/settings.json" ]]
jq -e '.theme == "shared" and .sounds.enabled == false and .zoom == 1.2' "$app/settings.json" >/dev/null
[[ "$(file_mode)" == 600 ]]
[[ ! -e "$home/.pi" && ! -e "$home/.claude" && ! -e "$home/.config/zed" ]]
printf '%s\n' '{"theme":"old-ui-choice","sounds":{"enabled":true,"done":"local.mp3"},"core":"/local/core","zoom":2}' > "$app/settings.json"
printf '%s\n' '{"zoom":1.5,"sounds":{"blocked":"local-blocked.mp3"}}' > "$app/settings.local.json"
merge
jq -e '.theme == "shared" and .zoom == 1.5 and .core == "/local/core" and .sounds == {"enabled":false,"done":"local.mp3","blocked":"local-blocked.mp3"}' "$app/settings.json" >/dev/null
before="$(hash)"
ln "$app/settings.json" "$fixture/unchanged.json"
chmod 644 "$app/settings.json"
touch -t 202001010000 "$app/settings.json"
touch "$fixture/after-settings"
merge
[[ "$(file_mode)" == 600 ]]
[[ "$(hash)" == "$before" ]]
# Unchanged output is not replaced, so app watchers stay quiet.
[[ "$app/settings.json" -ef "$fixture/unchanged.json" ]]
[[ "$app/settings.json" -ot "$fixture/after-settings" ]]
printf '%s\n' '{"theme":"updated","sounds":{"enabled":false},"zoom":1.2}' > "$app/settings.base.json"
merge
jq -e '.theme == "updated" and .zoom == 1.5 and .core == "/local/core"' "$app/settings.json" >/dev/null

for bad in '{invalid' 'null' '[]' 'true' '"text"' '' '{} {}'; do
  printf '%s\n' "$bad" > "$app/settings.local.json"
  expect_failure
done
rm "$app/settings.local.json"
mkdir "$app/settings.local.json"
expect_failure
rmdir "$app/settings.local.json"
printf '%s\n' '{}' > "$app/settings.local.json"
printf '%s\n' '[]' > "$app/settings.base.json"
expect_failure
printf '%s\n' '{}' > "$app/settings.base.json"
printf '%s\n' '{invalid' > "$app/settings.json"
expect_failure
printf '%s\n' '{}' > "$app/settings.json"

# Never follow or replace a symlink to an unrelated settings file.
printf '%s\n' '{"untouched":true}' > "$fixture/unrelated.json"
rm "$app/settings.json"
ln -s "$fixture/unrelated.json" "$app/settings.json"
expect_failure
[[ -L "$app/settings.json" ]]
jq -e '.untouched' "$fixture/unrelated.json" >/dev/null
rm "$app/settings.json"
mkdir "$app/settings.json"
if merge 2>/dev/null; then
  echo 'Expected output directory to fail' >&2
  exit 1
fi
rmdir "$app/settings.json"

# Migrate the previous Stow target, including a dangling link after the rename.
# A miniature checkout keeps the legacy target out of the real repository.
mini="$fixture/repo"
mkdir -p "$mini/bin/bin" "$mini/herdr-app/.config/herdr-app"
cp "$script" "$mini/bin/bin/merge-settings"
printf '%s\n' '{"theme":"legacy","keepLocal":true}' > "$mini/herdr-app/.config/herdr-app/settings.json"
ln -s "$mini/herdr-app/.config/herdr-app/settings.json" "$app/settings.json"
HOME="$home" HERDR_APP_HOME="$app" bash "$mini/bin/bin/merge-settings" --herdr-app-only >/dev/null
[[ ! -L "$app/settings.json" ]]
jq -e '.keepLocal' "$app/settings.json" >/dev/null
rm "$app/settings.json" "$mini/herdr-app/.config/herdr-app/settings.json"
ln -s "$mini/herdr-app/.config/herdr-app/settings.json" "$app/settings.json"
HOME="$home" HERDR_APP_HOME="$app" bash "$mini/bin/bin/merge-settings" --herdr-app-only >/dev/null
[[ -f "$app/settings.json" && ! -L "$app/settings.json" ]]

# Config-root selection and first-run directory creation.
rm "$app/settings.base.json"
xhome="$fixture/xdg-home"
HOME="$home" XDG_CONFIG_HOME="$xhome" HERDR_APP_HOME= "$script" --herdr-app-only >/dev/null
[[ -f "$xhome/herdr-app/settings.json" ]]
[[ ! -L "$xhome/herdr-app/settings.json" ]]
jq -e '.theme == "dracula"' "$xhome/herdr-app/settings.json" >/dev/null

# An app-home folder symlink would send runtime files into its target.
ln -s "$app" "$fixture/folded"
printf '%s\n' '{}' > "$app/settings.base.json"
if HOME="$home" HERDR_APP_HOME="$fixture/folded" "$script" --herdr-app-only >/dev/null 2>&1; then
  echo 'Expected a folded app-home symlink to fail' >&2
  exit 1
fi

# The default all-tools path also includes Herdr App (other tools use fixtures).
mkdir -p "$home/.config/zed" "$home/.pi/agent" "$home/.claude"
printf '%s\n' '{}' > "$home/.config/zed/settings.base.json"
printf '%s\n' '{}' > "$home/.pi/agent/settings.base.json"
printf '%s\n' '{"mcpServers":{}}' > "$home/.pi/agent/mcp.base.json"
printf '%s\n' '{}' > "$home/.claude/settings.base.json"
printf '%s\n' '{"theme":"all-tools"}' > "$app/settings.base.json"
HOME="$home" HERDR_APP_HOME="$app" "$script" >/dev/null
jq -e '.theme == "all-tools"' "$app/settings.json" >/dev/null

# Fresh Stow deployment and restow leave generated settings/state outside Git.
mkdir -p "$mini/herdr-app/.config/herdr-app/themes" "$fixture/deployed"
cp "$repo/herdr-app/.stow-local-ignore" "$mini/herdr-app/.stow-local-ignore"
cp "$repo/herdr-app/.config/herdr-app/settings.base.json" "$mini/herdr-app/.config/herdr-app/settings.base.json"
cp "$repo/herdr-app/.config/herdr-app/themes/dracula.json" "$mini/herdr-app/.config/herdr-app/themes/dracula.json"
# Even accidentally created generated files must not be installed by Stow.
printf '%s\n' '{"shouldNotDeploy":true}' > "$mini/herdr-app/.config/herdr-app/settings.json"
printf '%s\n' '{"shouldNotDeploy":true}' > "$mini/herdr-app/.config/herdr-app/settings.local.json"
stow --dir="$mini" --target="$fixture/deployed" --no-folding herdr-app
installed="$fixture/deployed/.config/herdr-app"
[[ -L "$installed/settings.base.json" && ! -e "$installed/settings.json" && ! -e "$installed/settings.local.json" ]]
HOME="$fixture/deployed" HERDR_APP_HOME="$installed" bash "$mini/bin/bin/merge-settings" --herdr-app-only >/dev/null
[[ -f "$installed/settings.json" && ! -L "$installed/settings.json" ]]
jq -e '.theme == "dracula" and .shouldNotDeploy == null' "$installed/settings.json" >/dev/null
printf '%s\n' '{}' > "$installed/shared.json"
stow --dir="$mini" --target="$fixture/deployed" --no-folding -R herdr-app
[[ ! -L "$installed" && ! -L "$installed/themes" && ! -L "$installed/settings.json" ]]
[[ ! -e "$mini/herdr-app/.config/herdr-app/shared.json" ]]

if HOME="$home" HERDR_APP_HOME="$app" "$script" --unknown >/dev/null 2>&1; then
  echo 'Expected an unknown option to fail' >&2
  exit 1
fi

echo 'merge-settings Herdr App tests passed'
