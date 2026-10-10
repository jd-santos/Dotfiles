#!/usr/bin/env bash
set -euo pipefail

script="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/bin/merge-settings"
fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT
mkdir -p "$fixture/.config/zed" "$fixture/.pi/agent"
printf '%s\n' '{}' > "$fixture/.config/zed/settings.base.json"
printf '%s\n' '{"enabledModels":["base-model"],"packages":["npm:pi-subagents@0.76.1","npm:@parallel-web/pi-extension"],"subagents":{"defaultModel":"base-child"},"defaultModel":"base-default"}' > "$fixture/.pi/agent/settings.base.json"
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
jq -e '.enabledModels == ["base-model"] and .packages == ["npm:pi-subagents@0.76.1", "npm:@parallel-web/pi-extension"] and .subagents.defaultModel == "base-child" and .defaultModel == "base-default"' "$fixture/.pi/agent/settings.json" >/dev/null
[[ "$(stat -f %Lp "$output")" == 600 ]]

printf '%s\n' '{"enabledModels":["stale-local-model"],"packages":["npm:stale-package"],"subagents":{"defaultModel":"stale-child"},"defaultModel":"local-default"}' > "$fixture/.pi/agent/settings.local.json"
mkdir -p "$fixture/.pi/agent/npm/node_modules/pi-subagents" "$fixture/.pi/agent/npm/node_modules/@parallel-web/pi-extension"
printf '%s\n' '{"dependencies":{"typebox":"1.1.38","acorn":"8.18.0"},"peerDependencies":{"@earendil-works/pi-coding-agent":"*"}}' > "$fixture/.pi/agent/npm/node_modules/pi-subagents/package.json"
printf '%s\n' '{"dependencies":{"typebox":"^1.1.37","parallel-web":"1.3.0"},"peerDependencies":{"@earendil-works/pi-coding-agent":">=0.83.0"}}' > "$fixture/.pi/agent/npm/node_modules/@parallel-web/pi-extension/package.json"
HOME="$fixture" "$script" >/dev/null
jq -e '.enabledModels == ["base-model"] and .packages == ["npm:pi-subagents@0.76.1", "npm:@parallel-web/pi-extension"] and .subagents.defaultModel == "base-child" and .defaultModel == "base-default"' "$fixture/.pi/agent/settings.json" >/dev/null
jq -e '.dependencies.typebox == null and .dependencies.acorn == "8.18.0" and .peerDependencies.typebox == "*" and .peerDependenciesMeta.typebox.optional == true' "$fixture/.pi/agent/npm/node_modules/pi-subagents/package.json" >/dev/null
jq -e '.dependencies.typebox == null and .dependencies["parallel-web"] == "1.3.0" and .peerDependencies.typebox == "*" and .peerDependenciesMeta.typebox.optional == true' "$fixture/.pi/agent/npm/node_modules/@parallel-web/pi-extension/package.json" >/dev/null
printf '%s\n' '{"defaultModel":"stale-local-default","lastChangelogVersion":"local-changelog","localOnly":true,"localOverrides":{"defaultModel":"intentional-local-default"}}' > "$fixture/.pi/agent/settings.local.json"
HOME="$fixture" "$script" >/dev/null
jq -e '.enabledModels == ["base-model"] and .packages == ["npm:pi-subagents@0.76.1", "npm:@parallel-web/pi-extension"] and .subagents.defaultModel == "base-child" and .defaultModel == "intentional-local-default" and .lastChangelogVersion == "local-changelog" and .localOnly == true and (.localOverrides == null)' "$fixture/.pi/agent/settings.json" >/dev/null
rm "$fixture/.pi/agent/settings.local.json"

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
