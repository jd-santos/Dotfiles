# shellfish

A Claude Code mod that puts session telemetry and per-session switches where Claude Code already draws: the band above the prompt, the spinner, each turn's closing line, and a docked pane (the "shelf").

```text
── Redesign the shellfish band ───────────────────────────────────────────────────
Dotfiles on fix/footer                                     ‹ sonnet 5.5 › · high · auto
ctx ████████▓▓░░░░┃░░░░ 41%  │  5h 12%  7d 34%  │  cost ▁▂▂▅▃▇▂ $1.234  │  cache warm 58:12    ● 2 agents ▸
```

## Where things show

| Place | Shows |
| --- | --- |
| Band, top rule | A line separating the band from the transcript, with the session summary (auto or `/summary`) set into it. The line turns the accent colour while a turn runs. |
| Band, row 1 | Directory, Git branch, model, effort, permission mode |
| Band, row 2 | `ctx`: the context bar, each category in its own colour, a `┃` where auto-compact fires, and the percent used. `5h` and `7d`: percent of each rate-limit window used, coloured at 50% and 80%. `cost`: cost per turn for the last 12 turns as a sparkline, then the session's estimated API cost. `cache`: the prompt-cache timer (at 100 columns and wider). At the right, running subagents or `shelf ▸` |
| Band, agent rows | One row per running subagent under row 2 (up to 3, then `+n more`): status glyph, agent type, task and elapsed time. Press a row to view that agent's transcript; it leaves when the agent finishes. |
| Hover | A one-line readout over row 2. Context bar: each category's share of the window in its bar colour, free space, and the compaction point. Limits: each window and when it resets. Cost and cache: session and last-turn cost, what the sparkline covers, tokens in and out, cache hit. |
| Click | Any row 2 field opens the shelf; `shelf ▸` at the right toggles it (`◂` while it is open) |
| Shelf pane | The session summary as its title in the accent colour, with the last turn's model, effort, time, output and cost under it (hover a chart column to swap in that turn). Then the Agents section, always present, with a running count in its header (press an agent to view its transcript), the context bar with the compaction point and a key sorted by size (share and tokens per category, free space last), cost and context charts with one column per turn, rate-limit bars, and the cache section. Each section opens with a ruled heading that carries its headline figure at the right (`Agents ──── ● 2 running`). It opens by itself when the first subagent runs. |
| Prompt dividers | A rule above each prompt you type, labelled with the time you sent it (`── 14:32 ────`), so each exchange reads as a new section. Prompts from before a restart get the rule without a time. |
| Spinner | Live tokens per second while a response streams |
| Turn closing line | `Baked for 42s · 3.1k out · 61 t/s · $0.210 · ctx 31%` |
| Toasts | Once each, when context or a rate-limit window reaches 80% |

On narrow terminals the band drops the cache timer below 100 columns, the sparkline below 90 and the limits below 70, and the context bar shortens; the summary in the top rule is shortened to fit. The shelf docks beside the transcript in fullscreen at 110 columns and wider, asking for a 52-column sidebar (drag it to resize; your width is kept); elsewhere, tmux included, Claude Code opens it above the prompt. Which side the dock sits on is Claude Code's choice, not the mod's.

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

## Commands

| Command | Use |
| --- | --- |
| `/shelf` | Open the shelf, or close it when it is open |
| `/summary [text\|clear]` | Show, set, or clear the session summary |
| `/keepalive [minutes\|off]` | Keep the prompt cache warm through a break longer than an hour (default 180 minutes, max 720) |

## Usage log

| File | Contents |
| --- | --- |
| `~/.claude/shellfish/usage.jsonl` | One row per main-loop turn: time, session, directory, model, effort, duration, input, output, cache read and write tokens, turn cost, session cost, context percent, and tokens per context category (`contextTokens`) |
| `~/.claude/shellfish/sessions/<session id>.json` | The session's running totals, rewritten after each turn |

Costs are Claude Code's own figures at API list prices: an estimate of what the session would cost on the API, not what a subscription bills. A turn's cost includes the subagents and summary calls made during it. The log stays outside this repository.

```bash
# Estimated cost per day
jq -r '[.at[:10], .costUsd] | @tsv' ~/.claude/shellfish/usage.jsonl |
  awk '{ sum[$1] += $2 } END { for (d in sum) printf "%s  $%.2f\n", d, sum[d] }' | sort
```

## Cache

The shelf's Cache section exists because prompt caching is where most of a session's input cost goes. Each turn resends the whole conversation. The part that matches the previous request is read from cache at 10% of the input price (5% on Opus 5.5, 2.5% on Fable); anything new is written at 125%. Reads keep the cache alive for 5 minutes from a request's start.

| Figure | Meaning |
| --- | --- |
| reused | Share of the session's input tokens read back from cache |
| warm m:ss / cold | Countdown on the entry the last request wrote. The line under it says what the next turn will cost: a cache read while warm, or a rewrite of the whole conversation at 125% once cold. |
| reused / written / uncached bar | Where the input tokens went; `cost n% of uncached` is what the input cost as a share of the same tokens at full price |
| wrote per turn | Tokens written to cache per turn, one column each. Normal turns write only the new text; a tall yellow column is a rewrite of the whole conversation. |
| rewrites | Turns that found no cache entry, and the likely cause: a pause past the lifetime, a model switch, an effort change, or a changed prompt (an edited CLAUDE.md, a new MCP server). Informational: it reports what happened, nothing here is a setting. |

Hover the Cache header for the explanation.

**Keep-alive.** `/keepalive [minutes]` (default 180, max 720), or the `Keep warm for 180 min` button under the Cache section's next-turn line in the shelf, keeps the entry alive through a break longer than an hour. Shortly before it lapses, the mod asks the API a one-word question over the session's own transcript; that reads the whole conversation from cache at the reused price and renews the timer. Your own turns renew it for free, so a probe only runs while the session is idle. It stops at the deadline, on `/keepalive off`, or when a probe finds the entry already gone. Each probe costs a cache read of the conversation (the shelf shows the figure for the current conversation) plus a few output tokens, against a rewrite at 125% of the input price; one probe an hour. Prefix caching is all-or-nothing, so a probe cannot keep one part of the conversation warm on its own. The band shows `↻` beside the timer while it runs. Each turn's row in `usage.jsonl` carries `cacheHit`, `gapMs` and `cold`, so the pattern is checkable later. Claude Code uses the API's one-hour cache: this log has shown 98% reuse after a 13-minute pause, which the 5-minute default could not do. The timer counts that hour. Practical upshot: keep a session's turns within 5 minutes of each other when you can, and switch models or effort between tasks rather than mid-task, since either rewrites the cache.

## Context and compaction

Claude Code compacts the conversation by itself when it nears the window (the `autoCompact` row in `/config`, on by default), so this mod injects no capacity notes into the conversation. The context card shows the threshold.

## Install

The `claude` stow package links `~/.claude/mods` (a local plugin marketplace), `~/.claude/keybindings.json`, `~/.claude/settings.base.json`, and `~/.claude/skills` (the shared skills from the `agents` package):

```bash
cd ~/Dotfiles && stow claude
merge-settings
```

`merge-settings` merges `claude/.claude/settings.base.json` into `~/.claude/settings.json`: it registers the `dotfiles-mods` marketplace, enables `shellfish`, and turns off the commit and PR attribution lines. Base keys win; everything else in the file stays machine-local, because Claude Code writes that file itself.

Claude Code reads the plugin straight from this folder. After editing it, run `/reload-plugins`.

## Develop

```bash
claude plugin validate ~/.claude/mods/shellfish
claude plugin test ~/.claude/mods/shellfish
```

The permission-mode label reads Claude Code's own footer mode indicator, so it is live; classic hook events are the fallback. `?` means neither has reported yet.
