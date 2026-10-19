# shellfish

A Claude Code mod that puts session telemetry and per-session switches where Claude Code already draws: the band above the prompt, the spinner, each turn's closing line, and a docked pane (the "shelf").

```text
~/Dotfiles/pi  git fix/footer                              ‹ sonnet 5.5 › · high  auto
ctx ██████░░░░░░░░░░ 31%/200k   out 12.3k cache 94%   t/s 54             est $1.234
» Port the Pi footer to Claude Code                                  agents 1/3 shelf ▸
```

## Where things show

| Place | Shows |
| --- | --- |
| Band, row 1 | Directory, Git branch, model, effort, permission mode |
| Band, row 2 | Context meter (yellow at 50%, red at 80%), output tokens, cache hit rate, speed, estimated API cost |
| Band, row 3 | Session summary (Haiku titles it after the first turn and every fifth), running subagents, and the shelf button |
| Hover cards | Hover the context, tokens or cost field. Context: window, auto-compact threshold, the largest categories, a per-turn sparkline. Tokens: input, output, cache read and write, cache hit, last turn. Cost: session and last-turn cost, rate-limit windows and resets, a per-turn sparkline. |
| Click a field | Pins its card under the band; click again to unpin |
| Spinner | Live tokens per second while a response streams |
| Turn closing line | `Baked for 42s · 3.1k out · 61 t/s · $0.210 · ctx 31%` |
| Shelf pane | Subagents with status and age; press one to view its transcript, and the back button to return. Below that, cost and context sparklines and the last eight turns. It opens by itself when the first subagent runs. |
| Toasts | Once each, when context or a rate-limit window reaches 80% |

Hovering and clicking need a terminal that reports the mouse. Claude Code's fullscreen mode does.

## Switching effort and model

| Key | Does |
| --- | --- |
| `Shift+Tab` | Cycle effort: low, medium, high, xhigh, max. Levels the model refuses are skipped. |
| `Option+.` / `Option+,` | Next or previous model: sonnet, haiku, fable, opus. Not `Option+]` / `Option+[`, which tmux takes for window switching. |
| `Option+m` | Cycle permission mode, Claude Code's own `Shift+Tab` |

Clicking the model or effort label does the same. Each switch runs `/model <name>` or `/effort <level>`, which applies to this session only and leaves your saved defaults alone.

These keys rely on a workaround. Claude Code has no built-in action for cycling effort or models, but a mod's Button can answer an engine action when no engine handler for that action is active. `claude/.claude/keybindings.json` binds the Chat keys to actions whose handlers exist only while their own dialogs are open: `effortSlider:increaseEffort`, `diff:nextSource` and `diff:previousSource`. The band's Buttons claim those actions, so the keys do nothing while the band is collapsed (`Ctrl+x Ctrl+a`) or a survey holds it.

On macOS the terminal must send Option as Alt. In Ghostty, set `macos-option-as-alt = left` (or `true`).

## Usage log

| File | Contents |
| --- | --- |
| `~/.claude/shellfish/usage.jsonl` | One row per main-loop turn: time, session, directory, model, effort, duration, input, output, cache read and write tokens, turn cost, session cost, context percent |
| `~/.claude/shellfish/sessions/<session id>.json` | The session's running totals, rewritten after each turn |

Costs are Claude Code's own figures at API list prices: an estimate of what the session would cost on the API, not what a subscription bills. A turn's cost includes the subagents and summary calls made during it. The log stays outside this repository.

```bash
# Estimated cost per day
jq -r '[.at[:10], .costUsd] | @tsv' ~/.claude/shellfish/usage.jsonl |
  awk '{ sum[$1] += $2 } END { for (d in sum) printf "%s  $%.2f\n", d, sum[d] }' | sort
```

## Context and compaction

Claude Code compacts the conversation by itself when it nears the window (the `autoCompact` row in `/config`, on by default), so this mod injects no capacity notes into the conversation. The context card shows the threshold.

## Install

The `claude` stow package links `~/.claude/mods` (a local plugin marketplace) and `~/.claude/keybindings.json`:

```bash
cd ~/Dotfiles && stow claude
claude plugin marketplace add ~/.claude/mods
claude plugin install shellfish@dotfiles-mods
```

Claude Code reads the plugin straight from this folder. After editing it, run `/reload-plugins`.

## Develop

```bash
claude plugin validate ~/.claude/mods/shellfish
claude plugin test ~/.claude/mods/shellfish
```

The permission-mode label comes from classic hook events, so it updates at the next prompt or tool call. Claude Code's own mode indicator is live.
