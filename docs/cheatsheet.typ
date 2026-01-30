#set page(
  paper: "us-letter",
  flipped: true,
  margin: (x: 0.5in, y: 0.4in),
)

#set text(font: "Helvetica", size: 8.5pt, fill: black)
#set heading(numbering: none)

// Section header styling
#let section-header(title) = [
  #text(size: 10pt, weight: "bold", fill: black, title)
  #line(length: 100%, stroke: 0.5pt + luma(200))
]

// PAGE 1: CORE ESSENTIALS
#columns(4)[

== Tmux Basics
#section-header("Prefix: Ctrl+O")

*Sessions & Windows:*
- `Prefix + c` — New window
- `Option+1-9` — Jump to window
- `Prefix + &` — Close window
- `Prefix + ,` — Rename window
- `Prefix + w` — Window list
- `Prefix + p/n` — Prev/next window

*Panes:*
- `Prefix + |` — Vertical split
- `Prefix + -` — Horizontal split
- `Prefix + h/j/k/l` — Navigate
- `Prefix + H/J/K/L` — Resize
- `Prefix + x` — Close pane
- `Prefix + z` — Zoom pane
- `Prefix + q` — Show pane numbers

*Copy Mode (vi-style):*
- `Prefix + [` — Enter copy mode
- `v` — Begin selection
- `y` — Copy & exit
- `Prefix + ]` — Paste
- `/` — Search forward
- `?` — Search backward

*Session Management:*
- `Prefix + d` — Detach
- `Prefix + s` — Session list
- `Prefix + (/)` — Prev/next session
- `Prefix + $` — Rename session

*Admin:*
- `Prefix + r` — Reload config
- `Prefix + ?` — List all keybinds
- `Prefix + t` — Show clock

#colbreak()

== Neovim: Navigation
#section-header("Leader: Space")

*Files & Buffers:*
- `<leader>ff` — Find files
- `<leader>fg` — Git files
- `<leader>fh` — Recent files
- `<leader>fb` — Buffer list
- `Shift+H/L` — Prev/next buffer
- `<leader>bd` — Delete buffer
- `<leader>bo` — Delete other buffers
- `<leader>e` — Toggle explorer
- `<leader>fn` — New file

*Windows:*
- `Ctrl+h/j/k/l` — Move between
- `<leader>-` — Split below
- `<leader>|` — Split right
- `<leader>wd` — Delete window
- `<leader>wm` — Maximize window
- `Ctrl+arrows` — Resize window

*Tabs:*
- `<leader><tab><tab>` — New tab
- `<leader><tab>d` — Close tab
- `<leader><tab>[/]` — Prev/next tab

*Search in File:*
- `/` — Search forward
- `?` — Search backward
- `n/N` — Next/prev match
- `*/#` — Search word at cursor
- `<leader>ur` — Clear highlights

*Editing Basics:*
- `jj` — Exit insert mode
- `u` — Undo
- `Ctrl+r` — Redo
- `Ctrl+s` — Save file

#colbreak()

== Neovim: LSP & Code
#section-header("Code Intelligence")

*Go To:*
- `gd` — Go to definition
- `gr` — Find references
- `gI` — Go to implementation
- `gy` — Go to type def
- `gD` — Go to declaration
- `K` — Hover documentation
- `gK` — Signature help

*Actions:*
- `<leader>ca` — Code action
- `<leader>cf` — Format file/selection
- `<leader>cr` — Rename symbol
- `<leader>cR` — Rename file
- `<leader>cc` — Run codelens

*Diagnostics:*
- `]d / [d` — Next/prev diagnostic
- `]e / [e` — Next/prev error
- `]w / [w` — Next/prev warning
- `<leader>cd` — Line diagnostics
- `<leader>xx` — All diagnostics

*Project Search:*
- `<leader>fs` — Live grep
- `<leader>fw` — Grep word at cursor
- `<leader>fd` — Document diagnostics
- `<leader>fl` — Document symbols
- `<leader>ss` — LSP symbols
- `<leader>sS` — Workspace symbols
- `<leader>sr` — Search & replace

*Flash (Quick Jump):*
- `s` — Flash forward
- `S` — Flash TreeSitter
- `r` — Remote Flash (operator)

*Comments:*
- `gcc` — Toggle line comment
- `gco` — Comment below
- `gcO` — Comment above

#colbreak()

== Shell Essentials
#section-header("Common Aliases")

*Navigation:*
- `..` — Up 1 level
- `...` — Up 2 levels
- `.3/.4/.5/.6` — Up N levels
- `mcd <dir>` — Mkdir + cd
- `cdf` — CD to Finder window

*List Files:*
- `ls` — Enhanced (colors, etc)
- `lt` — Sort by time
- `lk` — Sort by size
- `lx` — Sort by extension
- `lr` — Recursive tree

*Files & Archives:*
- `extract <file>` — Unzip any format
- `zipf <dir>` — Create ZIP
- `numFiles` — Count files in dir
- `ducks` — Top 10 largest items

*Search & Find:*
- `ff <name>` — Find file by name
- `ffs <prefix>` — Files starting with
- `ffe <suffix>` — Files ending with
- `ft "text"` — Find text in files
- `qfind` — Quick find

*System & Process:*
- `c` — Clear screen
- `memHogsTop` — Top memory users
- `cpuHogs` — Top CPU users
- `myIP` — Show public IP
- `myPs` — My processes
- `tm <proc>` — Find process

*macOS Specific:*
- `f` — Open Finder here
- `ql <file>` — Quick Look
- `trash <file>` — Move to trash
- `spotlight <q>` — Spotlight search

*fzf-lua Preview:*
- `Ctrl+d/u` — Page up/down
- `Ctrl+f/b` — Half-page scroll

]

// PAGE 2: ADVANCED
#pagebreak()
#columns(4)[

== Tmux Advanced
#section-header("Session Management")

*Command Line:*
- `tmux new -s <name>` — New session
- `tmux attach -t <name>` — Attach
- `tmux ls` — List sessions
- `tmux kill-session -t <name>`
- `tmux kill-server` — Kill all

*Pane Operations:*
- `Prefix + {/}` — Swap pane left/right
- `Prefix + !` — Break pane to window
- `Prefix + m` — Mark pane
- `Prefix + space` — Cycle layouts
- `setw synchronize-panes` — Sync

*Window Operations:*
- `Prefix + .` — Move window
- `Prefix + f` — Find window
- `Prefix + i` — Window info

*Scrollback & History:*
- `Prefix + PgUp` — Enter scroll mode
- `q` — Exit scroll mode
- `g/G` — Top/bottom of history

*Customization:*
- `set -g mouse on` — Mouse support
- `set -g base-index 1` — Start at 1
- `set -g history-limit 10000`

#colbreak()

== Git Integration
#section-header("Git (LazyVim)")

*Status & Diff:*
- `<leader>gs` — Git status
- `<leader>gd` — Diff hunks
- `<leader>gD` — Diff vs origin

*History & Blame:*
- `<leader>gl` — Log (repo root)
- `<leader>gL` — Log (cwd)
- `<leader>gf` — File history
- `<leader>gb` — Blame line

*Remote & GitHub:*
- `<leader>gB` — Browse in browser
- `<leader>gY` — Copy URL
- `<leader>gi` — GitHub issues (open)
- `<leader>gI` — GitHub issues (all)
- `<leader>gp` — GitHub PRs (open)
- `<leader>gP` — GitHub PRs (all)

*Stash:*
- `<leader>gS` — Git stash list

*Hunk Navigation:*
- `]h / [h` — Next/prev hunk
- Stage/unstage in status view

#colbreak()

== Neovim Advanced
#section-header("Power Features")

*Trouble (Better Lists):*
- `<leader>xx` — All diagnostics
- `<leader>xX` — Buffer diagnostics
- `<leader>cs` — Symbols outline
- `<leader>cS` — LSP references
- `<leader>xl` — Location list
- `<leader>xq` — Quickfix list
- `[q / ]q` — Prev/next quickfix

*UI Toggles:*
- `<leader>uf` — Auto format
- `<leader>uF` — Auto format (buffer)
- `<leader>us` — Spelling
- `<leader>uw` — Word wrap
- `<leader>ul` — Line numbers
- `<leader>uL` — Relative numbers
- `<leader>ud` — Diagnostics
- `<leader>uc` — Conceal
- `<leader>uh` — Inlay hints
- `<leader>uT` — Treesitter highlight

*Sessions:*
- `<leader>qs` — Restore session
- `<leader>ql` — Restore last
- `<leader>qd` — Don't save session
- `<leader>qS` — Select session

*Tools & Info:*
- `<leader>ft` — Terminal (root)
- `<leader>fT` — Terminal (cwd)
- `<c-/>` — Toggle terminal
- `<leader>l` — Lazy (plugins)
- `<leader>cm` — Mason (LSP)
- `<leader>cl` — LSP info

*Search Everything:*
- `<leader>sh` — Help pages
- `<leader>sk` — Keymaps
- `<leader>sc` — Commands
- `<leader>sa` — Autocmds
- `<leader>sH` — Highlights
- `<leader>su` — Undo tree
- `<leader>s/` — Search history
- `<leader>sm` — Marks
- `<leader>sj` — Jumps
- `<leader>s"` — Registers

#colbreak()

== Shell Advanced
#section-header("Utilities & Functions")

*Process Management:*
- `memHogsPs` — Memory (ps format)
- `topForever` — Loop top (10s)
- `ttop` — Lightweight top
- `findPid <name>` — Get PID

*Network & Connectivity:*
- `netCons` — All open sockets
- `lsock` — Open sockets (sudo)
- `lsockU` — UDP sockets only
- `lsockT` — TCP sockets only
- `openPorts` — Listening ports
- `ipInfo0` — en0 interface info
- `ipInfo1` — en1 interface info

*macOS Extras:*
- `flushDNS` — Clear DNS cache
- `ii` — Display host info
- `showBlocked` — Show blocked IPs
- `DT` — Pipe to Desktop file

*Python Development:*
- `venv` — Activate ./venv or .venv

*Shell Management:*
- `showa <pat>` — Search aliases
- `szsh` — Reload .zshrc
- `path` — Display PATH dirs

*Archive Formats (extract):*
- `.tar.bz2` `.tar.gz` `.bz2`
- `.rar` `.gz` `.tar` `.tbz2`
- `.tgz` `.zip` `.Z` `.7z`

*Surround (mini.surround):*
- `gsa` — Add surrounding
- `gsr` — Replace surrounding
- `gsd` — Delete surrounding

*Folding:*
- `za` — Toggle fold
- `zc/zo` — Close/open fold
- `zM/zR` — Close/open all folds
- `zj/zk` — Next/prev fold

]

#v(1fr)
#align(center)[
  #text(size: 7pt, fill: luma(120))[
    _Terminal Workflow Cheatsheet | LazyVim + Tmux + Zsh | Updated Jan 2026_
  ]
]
