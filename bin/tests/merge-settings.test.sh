#!/usr/bin/env bash
set -euo pipefail

script="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/bin/merge-settings"
fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT
mkdir -p "$fixture/.config/zed" "$fixture/.pi/agent"
printf '%s\n' '{}' > "$fixture/.config/zed/settings.base.json"
printf '%s\n' '{}' > "$fixture/.pi/agent/settings.base.json"
printf '%s\n' '{"mcpServers":{"svelte":{"command":"npx","args":["-y","@sveltejs/mcp"]}}}' > "$fixture/.pi/agent/mcp.base.json"
output="$fixture/.pi/agent/mcp.json"
printf '%s\n' '{"mcpServers":{"personal":{"url":"https://example.com/mcp"}}}' > "$output"
unmanaged="$(shasum -a 256 "$output")"
if HOME="$fixture" "$script" >/dev/null 2>&1; then
  echo 'Expected unmanaged MCP config to require migration' >&2
  exit 1
fi
[[ "$(shasum -a 256 "$output")" == "$unmanaged" ]]
rm "$output"

HOME="$fixture" "$script" >/dev/null
[[ -f "$fixture/.pi/agent/.mcp-managed" ]]
jq -e '.mcpServers.svelte.command == "npx" and (.mcpServers | length) == 1' "$output" >/dev/null
[[ "$(stat -f %Lp "$output")" == 600 ]]

printf '%s\n' '{"mcpServers":{"svelte":{"exposure":"direct"},"personal-http":{"url":"https://example.com/mcp"}}}' > "$fixture/.pi/agent/mcp.local.json"
HOME="$fixture" "$script" >/dev/null
jq -e '.mcpServers.svelte.command == "npx" and .mcpServers.svelte.exposure == "direct" and .mcpServers["personal-http"].url == "https://example.com/mcp"' "$output" >/dev/null
[[ "$(stat -f %Lp "$output")" == 600 ]]

before="$(shasum -a 256 "$output")"
printf '%s\n' '{invalid json' > "$fixture/.pi/agent/mcp.local.json"
if HOME="$fixture" "$script" >/dev/null 2>&1; then
  echo 'Expected invalid local MCP config to fail' >&2
  exit 1
fi
[[ "$(shasum -a 256 "$output")" == "$before" ]]

printf '%s\n' '{"mcpServers":{"broken":"not a server config"}}' > "$fixture/.pi/agent/mcp.local.json"
if HOME="$fixture" "$script" >/dev/null 2>&1; then
  echo 'Expected invalid MCP server descriptor to fail' >&2
  exit 1
fi
[[ "$(shasum -a 256 "$output")" == "$before" ]]

printf '%s\n' '{invalid json' > "$fixture/.pi/agent/settings.local.json"
settings_before="$(shasum -a 256 "$fixture/.pi/agent/settings.json")"
if HOME="$fixture" "$script" >/dev/null 2>&1; then
  echo 'Expected invalid Pi settings override to fail' >&2
  exit 1
fi
[[ "$(shasum -a 256 "$fixture/.pi/agent/settings.json")" == "$settings_before" ]]

rm "$fixture/.pi/agent/settings.local.json" "$fixture/.pi/agent/mcp.local.json"
settings_output="$fixture/.pi/agent/settings.json"
rm "$settings_output"
mkdir "$settings_output"
if HOME="$fixture" "$script" >/dev/null 2>&1; then
  echo 'Expected settings output directory to fail' >&2
  exit 1
fi
rmdir "$settings_output"

rm "$output"
mkdir "$output"
if HOME="$fixture" "$script" >/dev/null 2>&1; then
  echo 'Expected MCP output directory to fail' >&2
  exit 1
fi
rmdir "$output"

echo 'merge-settings MCP tests passed'
