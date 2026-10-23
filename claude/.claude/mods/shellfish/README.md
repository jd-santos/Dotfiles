# 🐚 shellfish 🐟

A Claude Code mod that shows what a session is costing and where its context is going, in the places Claude Code already draws: the band above the prompt, the spinner, each turn's closing line, a rule above each prompt, and a docked pane called the shelf.

```text
── Redesign the shellfish band ───────────────────────────────────────────────────
Dotfiles on fix/footer                                     ‹ sonnet 5.5 › · high · auto
ctx ████████▓▓░░░░┃░░░░ 41%  │  5h 12%  7d 34%  │  cost ▁▂▂▅▃▇▂ $1.234  │  cache warm 58:12    ● 2 agents ▸
```

## The band

The band sits above the prompt.

| Row | Shows |
| --- | --- |
| Top rule | Separates the band from the transcript. The session summary is set into it (written automatically, or set with `/summary`). The rule turns the accent colour while a turn runs. |
| Row 1 | Directory and Git branch on the left; model, effort and permission mode on the right |
| Row 2 | `ctx`: the context bar, one colour per category, with `┃` where auto-compact fires and the percent used. `5h` and `7d`: the share of each rate-limit window used, yellow at 50% and red at 80%. `cost`: a sparkline of the last 12 turns' cost, then the session's estimated API cost. `cache`: the prompt-cache countdown. At the right, the running subagent count or `shelf ▸`. |
| Agent rows | One row per running subagent, up to 3, then `+n more`: status, agent type, task and elapsed time. Press a row to open that agent's transcript. A row leaves when its agent finishes. |

Hover a field in row 2 for a one-line readout in its place:

- **Context:** each category's share of the window, free space, and the compaction point.
- **Limits:** each window's use and when it resets.
- **Cost and cache:** session and last-turn cost, what the sparkline covers, tokens in and out, and the cache hit rate.

Click any row 2 field to open the shelf. `shelf ▸` at the right opens or closes it, and shows `◂` while it's open.

Narrow terminals lose fields from the right: the cache countdown below 100 columns, the sparkline below 90, and the limits below 70. The context bar shortens and the summary in the top rule is cut to fit.

## The shelf

The shelf is a pane that docks beside the transcript in fullscreen at 110 columns and wider. It asks for a 52-column sidebar; drag it to resize and Claude Code keeps your width. Elsewhere, tmux included, it opens above the prompt instead. Claude Code chooses which side it docks on. It opens by itself the first time a subagent runs.

From top to bottom:

- **Title:** the session summary, with the last turn's model, effort, time, output and cost under it. Hover a chart column to see that turn instead.
- **Agents:** every subagent this session, newest first, with the running count in the heading. Press one to open its transcript.
- **Context:** the context bar with the compaction point, and a key sorted by size showing each category's share and tokens, with free space last.
- **Turns:** cost and context charts, one column per turn.
- **Limits:** a bar per rate-limit window, with its reset time.
- **Cache:** see [Cache](#cache).
- **Footer:** the usage log's path and a `🐚 shellfish 🐟 a Claude mod by JD Santos` sign-off.

Each section opens with a ruled heading that carries its headline figure at the right, such as `Agents ──────── ● 2 running`.

## In the transcript

| Place | Shows |
| --- | --- |
| Prompt divider | A rule above each prompt you type, labelled with the time you sent it: `── 14:32 ────`. Prompts sent before Claude Code restarted get the rule without a time. |
| Spinner | Live tokens per second while a response streams |
| Turn closing line | `Baked for 42s · 3.1k out · 61 t/s · $0.210 · ctx 31%` |
| Toasts | One each when context or a rate-limit window reaches 80% |

Hovering and clicking need a terminal that reports the mouse. Claude Code's fullscreen mode does.

## Switching effort and model

| Key | Does |
| --- | --- |
| `Shift+Tab` | Cycle effort: low, medium, high, xhigh, max. Levels the current model refuses are skipped. |
| `Option+.` / `Option+,` | Next or previous model: sonnet, haiku, fable, opus |
| `Option+m` | Cycle permission mode (Claude Code's own `Shift+Tab`) |

Clicking the model or effort label does the same. Each switch runs `/model <name>` or `/effort <level>`, which applies to this session only and leaves your saved defaults alone.

The model keys avoid `Option+]` and `Option+[`, which tmux uses for window switching. On macOS the terminal must send Option as Alt; in Ghostty, set `macos-option-as-alt = left` (or `true`).

These keys rely on a workaround. Claude Code has no built-in action for cycling effort or models, but a mod's Button can answer an engine action while no engine handler for it is active. `claude/.claude/keybindings.json` binds the Chat keys to three actions whose handlers exist only while their own dialogs are open: `effortSlider:increaseEffort`, `diff:nextSource` and `diff:previousSource`. The band's Buttons claim those actions. So the keys do nothing while the band is collapsed (`Ctrl+x Ctrl+a`) or a survey holds it.

## Commands

| Command | Use |
| --- | --- |
| `/shelf` | Open the shelf, or close it if it's open |
| `/summary [text\|clear]` | Show, set, or clear the session summary. A summary you set stays until you clear it. |
| `/keepalive [minutes\|off]` | Keep the prompt cache warm through a break longer than an hour (default 180 minutes, max 720) |

## Cache

Prompt caching is where most of a session's input cost goes, which is why the shelf gives it a section. Each turn resends the whole conversation. The part that matches the previous request is read from cache at 10% of the input price (5% on Opus 5.5, 2.5% on Fable), and anything new is written to cache at 125%.

Claude Code uses the API's one-hour cache, and the countdown counts that hour from the last request. Sessions in the usage log have shown 98% reuse after a 13-minute pause, which the five-minute cache couldn't do.

| Figure | Meaning |
| --- | --- |
| reused | Share of the session's input tokens read back from cache |
| warm m:ss / cold | Time left on the entry the last request wrote. The line under it says what the next turn will cost: a cache read while warm, or a rewrite of the whole conversation at 125% once cold. |
| reused / written / uncached bar | Where the session's input tokens went. `cost n% of uncached` is what that input cost, as a share of the same tokens at full price. |
| wrote per turn | Tokens written to cache per turn, one column each. A normal turn writes only its new text; a tall yellow column is a rewrite of the whole conversation. |
| rewrites | Turns that found no cache entry, with the likely cause: a pause past the hour, a model switch, an effort change, or a changed prompt (an edited CLAUDE.md, a new MCP server). It reports what happened; none of these are settings. |

Hover the Cache heading for a short explanation.

To keep cache costs down, keep a session's turns within an hour of each other, and switch models or effort between tasks rather than mid-task, since either rewrites the cache.

### Keep-alive

`/keepalive [minutes]`, or the `Keep warm for 180 min` button in the shelf's Cache section, keeps the cache entry alive through a break longer than an hour.

About two minutes before the entry lapses, the mod asks the API a one-word question over the session's own transcript. That reads the whole conversation from cache at the reused price and restarts the hour. Your own turns renew the entry for free, so a probe only runs while the session is idle. The band shows `↻` beside the countdown while keep-alive is on.

Each probe costs a cache read of the conversation plus a few output tokens, at most one an hour. The shelf shows that figure for the current conversation. The alternative is a rewrite at 125% of the input price. Prefix caching is all-or-nothing, so a probe can't keep part of a conversation warm.

Keep-alive stops at its deadline, on `/keepalive off`, or when a probe finds the entry already gone.

## Usage log

| File | Contents |
| --- | --- |
| `~/.claude/shellfish/usage.jsonl` | One row per main-loop turn: time, session, directory, model, effort, duration, input, output, cache read and write tokens, turn cost, session cost, context percent, tokens per context category (`contextTokens`), and the cache figures `cacheHit`, `gapMs` and `cold` |
| `~/.claude/shellfish/sessions/<session id>.json` | The session's running totals, rewritten after each turn |

Costs are Claude Code's own figures at API list prices. They estimate what the session would cost on the API, not what a subscription bills. A turn's cost includes the subagents and summary calls made during it. The log stays outside this repository.

```bash
# Estimated cost per day
jq -r '[.at[:10], .costUsd] | @tsv' ~/.claude/shellfish/usage.jsonl |
  awk '{ sum[$1] += $2 } END { for (d in sum) printf "%s  $%.2f\n", d, sum[d] }' | sort
```

## What it runs on your account

- **Session summary:** after the first turn and every 5 turns after, the mod asks Haiku for a 3-to-8-word title from your recent prompts. A summary set with `/summary` stops this.
- **Keep-alive:** off unless you turn it on.
- **Git:** after each turn it runs `git branch --show-current` in the session's directory.

Claude Code compacts the conversation by itself when it nears the window (the `autoCompact` row in `/config`, on by default), so the mod adds nothing to the conversation about capacity. The context bar shows where compaction happens.

## Install

The `claude` stow package links `~/.claude/mods` (a local plugin marketplace), `~/.claude/keybindings.json`, `~/.claude/settings.base.json`, and `~/.claude/skills` (the shared skills from the `agents` package):

```bash
cd ~/Dotfiles && stow claude
merge-settings
```

`merge-settings` merges `claude/.claude/settings.base.json` into `~/.claude/settings.json`. It registers the `dotfiles-mods` marketplace, enables `shellfish`, and turns off the commit and PR attribution lines. Base keys win, and everything else in the file stays machine-local, because Claude Code writes that file itself.

Claude Code reads the plugin straight from this folder. After editing it, run `/reload-plugins`.

## Develop

```bash
claude plugin validate ~/.claude/mods/shellfish
claude plugin test ~/.claude/mods/shellfish
```

The permission-mode label reads Claude Code's own footer mode indicator, with classic hook events as a fallback. `?` means neither has reported yet.
