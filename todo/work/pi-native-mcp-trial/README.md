# Move Pi MCP servers to native support

Status: Validated for a local commit. The user confirmed native Pi MCP and OpenRouter authentication work after restarting Pi in Herdr with the updated wrapper. Private migration backups remain pending a cleanup decision.

## Goal

Keep standard Svelte and Xcode servers tracked in this public repo while keeping personal authentication and optional computer-specific servers local. Remove the adapter and Brave Search from Pi; retain the generic MCP file for other clients without Brave Search.

## Decision

Track `pi/.pi/agent/mcp.base.json` with safe native definitions. `merge-settings` combines it with ignored `~/.pi/agent/mcp.local.json` into owner-only `~/.pi/agent/mcp.json`. The local file contains a personal HTTP server and the Xcode beta directory override on this computer. Atlassian remains optional on the computer with an `atlassian-mcp` wrapper. The generic `~/.config/mcp/mcp.json` remains for other clients and is no longer a Pi input.

The adapter's shared-config discovery, lazy lifecycle fields, and proxy tool are not native Pi features. Pi uses its own MCP manager and codemode exposure. Do not put personal URLs, 1Password references, or credentials in Git. Preserve a path to restore the local config until a fresh native session is validated.

## Acceptance criteria

- The generated Pi config contains Svelte, Xcode, and the personal HTTP server; all three connect when local authentication is available.
- Brave Search and the adapter are absent from Pi settings. The generic config also omits Brave Search.
- An existing unmanaged personal `mcp.json` cannot be silently overwritten by `merge-settings` on another computer.
- The local server URL, bearer-token command, and token stay outside Git, command output, and review artifacts.
- The remaining `typebox` package warnings are reported separately rather than hidden by editing installed manifests.

## Checklist

- [x] Confirm Svelte, Xcode, and the personal server in an isolated native Pi config without printing credentials.
- [x] Track safe native defaults and add a tested, private MCP merge to `merge-settings`.
- [x] Move this computer's server and Xcode beta override into ignored local config; update Pi settings and docs.
- [x] Trace Herdr's missing 1Password modal. The user reports that `OP_BIOMETRIC_UNLOCK_ENABLED=true` restores the prompt and native MCP connection in an interactive pane.
- [x] Confirm a fresh native Pi session connects the required servers with the updated wrapper; user reported success after restarting Pi in Herdr.
- [ ] Ask before removing the private migration backups; retain them until cleanup is authorized.
- [x] Investigate remaining third-party package warnings without modifying installed manifests.

## Validation and remaining issue

An isolated `PI_CODING_AGENT_DIR` test connected Svelte (4 tools), Xcode (53), and the personal HTTP server (4). The current generated native config has all three entries with mode `600`; Pi settings no longer load the adapter. `bash -n`, the focused merge test (including invalid sources, unmanaged output, and output-directory rejection), JSON checks, and two scoped review rounds passed without remaining blockers. After the migration, `pi mcp list` from an agent tool shell without a TTY connected Svelte and Xcode but failed to authenticate the personal server. `op vault list` prompted normally in Ghostty but not in a Herdr shell despite its PTY and `Aqua` launch context. The Herdr command succeeded with `OP_BIOMETRIC_UNLOCK_ENABLED=true`, and the user reports native `pi mcp list` also works with that flag. The `~/bin/pi` wrapper now sets the flag on macOS in Herdr unless the user set it explicitly, so it reaches the OpenRouter startup resolver and native Pi's MCP resolver. `bin/tests/pi-wrapper.test.sh` covers the flag and opt-out. The user subsequently confirmed the restarted Pi session works. `/reload` alone cannot change the current process environment.

The personal config was backed up privately before migration, and a separate pre-correction backup remains. Neither backup is in this repo. The older pinned `pi-subagents@0.51.0` has a `typebox` manifest warning; npm reports a newer release with the correct peer declaration, but upgrading the pin needs review. The latest published Parallel web extension still declares `typebox` as a dependency, so that warning requires an upstream fix.
