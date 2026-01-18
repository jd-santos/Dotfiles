# Source local zshrc if present
if [[ -f ~/.zshrc.local ]]; then
  source ~/.zshrc.local
fi

# ┌───────────────────────────────────────────────────────────────────┐
# │ Environment Variables & Paths                                     │
# └───────────────────────────────────────────────────────────────────┘

# Editor
export EDITOR="zed --wait"

# Homebrew
eval "$(/opt/homebrew/bin/brew shellenv)"

# Go
export PATH=$PATH:/usr/local/go/bin

# pyenv
export PYENV_ROOT="$HOME/.pyenv"
[[ -d $PYENV_ROOT/bin ]] && export PATH="$PYENV_ROOT/bin:$PATH"
if command -v pyenv &>/dev/null; then
  eval "$(pyenv init -)"
  eval "$(pyenv virtualenv-init -)"
fi

# Dotnet
export PATH="$PATH:/usr/local/share/dotnet"
export PATH="$PATH:$HOME/.dotnet/tools"

# LM Studio
export PATH="$PATH:$HOME/.lmstudio/bin"

# Source .env-local if it exists
if [ -f ~/.env-local ]; then
  source ~/.env-local
fi

# ┌───────────────────────────────────────────────────────────────────┐
# │ Aliases                                                           │
# └───────────────────────────────────────────────────────────────────┘

# Core Command Overrides
alias cp='cp -iv' # Preferred 'cp' implementation
alias mv='mv -iv' # Preferred 'mv' implementation
alias mkdir='mkdir -pv' # Preferred 'mkdir' implementation
alias ls='ls -FGlAhp' # Preferred 'ls' implementation
alias less='less -FSRXc' # Preferred 'less' implementation
alias cat='bat' # Preferred 'cat' implementation

# Better LS
alias lx='ls -lXB' # Sort by extension.
alias lk='ls -lSr' # Sort by size, biggest last.
alias lt='ls -ltr' # Sort by date, most recent last.
alias lc='ls -ltcr' # Sort by/show change time,most recent last.
alias lu='ls -ltur' # Sort by/show access time,most recent last.
alias lr='ls -R | grep ":$" | sed -e '\''s/:$//'\'' -e '\''s/[^-][^\/]*\//--/g'\'' -e '\''s/^/ /'\'' -e '\''s/-/|/'\'' | less' # lr: Full Recursive Directory Listing

# Navigation
alias cd..='cd ../' # Go back 1 directory level (for fast typers)
alias ..='cd ../' # Go back 1 directory level
alias ...='cd ../../' # Go back 2 directory levels
alias .3='cd ../../../' # Go back 3 directory levels
alias .4='cd ../../../../' # Go back 4 directory levels
alias .5='cd ../../../../../' # Go back 5 directory levels
alias .6='cd ../../../../../../' # Go back 6 directory levels

# File & Directory Management
alias numFiles='echo $(ls -1 | wc -l)' # numFiles: Count of non-hidden files in current dir
zipf () { zip -r "$1".zip "$1" ; } # zipf: To create a ZIP archive of a folder

# Searching
alias qfind="find . -name " # qfind: Quickly search for file
ff () { /usr/bin/find . -name "$@" ; } # ff: Find file under the current directory
ffs () { /usr/bin/find . -name "$@"'*' ; } # ffs: Find file whose name starts with a given string
ffe () { /usr/bin/find . -name '*'"$@" ; } # ffe: Find file whose name ends with a given string
ft() { /usr/bin/find . -name "$2" -exec grep -il "$1" {} \; } # ft: Find text in any file

# Process Management
alias memHogsTop='top -l 1 -o rsize | head -20' # memHogsTop, memHogsPs: Find memory hogs
alias memHogsPs='ps wwaxm -o pid,stat,vsize,rss,time,command | head -10'
alias cpuHogs='ps wwaxr -o pid,stat,%cpu,time,command | head -10' # cpuHogs: Find CPU hogs
alias topForever='top -l 9999999 -s 10 -o cpu' # topForever: Continual 'top' listing (every 10 seconds)
alias ttop="top -R -F -s 10 -o rsize" # ttop: Recommended 'top' invocation to minimize resources
alias tm="ps -ef | grep" # tm: Search for a process

# Networking
alias myIP='curl icanhazip.com' # myIP: Public facing IP Address
alias netCons='lsof -i' # netCons: Show all open TCP/IP sockets
alias lsock='sudo /usr/sbin/lsof -i -P' # lsock: Display open sockets
alias lsockU='sudo /usr/sbin/lsof -nP | grep UDP' # lsockU: Display only open UDP sockets
alias lsockT='sudo /usr/sbin/lsof -nP | grep TCP' # lsockT: Display only open TCP sockets
alias openPorts='sudo lsof -i | grep LISTEN' # openPorts: All listening connections

# Misc
alias c='clear' # c: Clear terminal display
alias ducks='du -cks *|sort -rn|head -11' # ducks: List top ten largest files/directories in current directory
alias path='echo -e ${PATH//:/\\n}' # path: Echo all executable Paths
alias szsh='source ~/.zshrc' # szsh: Reload .zshrc configuration

# ┌───────────────────────────────────────────────────────────────────┐
# │ Functions                                                         │
# └───────────────────────────────────────────────────────────────────┘

# cd: Override default cd to automatically list directory contents
# Improves navigation by showing what's in the directory you just entered
# Skipped if PS1 is not set (non-interactive shells)
cd() { builtin cd "$@"; [[ -n "$PS1" ]] && ls; }

# mcd: Create a new directory and immediately change into it
# Usage: mcd <directory_path>
# Example: mcd ~/projects/my-new-project
mcd () { mkdir -p "$1" && cd "$1"; }

# showa: Search and display aliases and functions matching a pattern
# Usage: showa <pattern>
# Example: showa ls  (displays all aliases/functions containing 'ls')
# Opens results in a pager for easy navigation
showa () { /usr/bin/grep --color=always -i -a1 $@ ~/.zshrc | grep -v '^\s*$' | less -FSRXc ; }

# extract: Extract most known archives with one command
# Usage: extract <archive_file>
# Supports: tar.bz2, tar.gz, bz2, rar, gz, tar, tbz2, tgz, zip, Z, 7z
# Dependencies: Common archive utilities (tar, unzip, 7z, etc.)
extract () {
  if [ -f $1 ] ; then
    case $1 in
      *.tar.bz2) tar xjf $1 ;;
      *.tar.gz) tar xzf $1 ;;
      *.bz2) bunzip2 $1 ;;
      *.rar) unrar e $1 ;;
      *.gz) gunzip $1 ;;
      *.tar) tar xf $1 ;;
      *.tbz2) tar xjf $1 ;;
      *.tgz) tar xzf $1 ;;
      *.zip) unzip $1 ;;
      *.Z) uncompress $1 ;;
      *.7z) 7z x $1 ;;
      *) echo "'$1' cannot be extracted via extract()" ;;
    esac
  else
    echo "'$1' is not a valid file"
  fi
}

# findPid: Find the process ID of a running process by name
# Usage: findPid <process_name>
# Example: findPid node  (returns PIDs of all node processes)
# Dependencies: lsof (list open files)
findPid () { lsof -t -c "$@" ; }

# venv: Activate a Python virtual environment in the current directory
# Usage: venv
# Supports both 'venv' and '.venv' directory names
# Returns error if no virtual environment is found
# Common usage: After cloning a Python project, run 'venv' to activate
venv() {
    if [ -f "venv/bin/activate" ]; then
        source "venv/bin/activate"
    elif [ -f ".venv/bin/activate" ]; then
        source ".venv/bin/activate"
    else
        echo "No venv or .venv found in the current directory."
        return 1
    fi
}

# myPs: List processes owned by the current user with detailed information
# Usage: myPs [ps_options]
# Shows: PID, CPU%, Memory%, start time, elapsed time, BSD time, and command
# Example: myPs aux  (lists processes with additional flags)
myPs() { ps $@ -u $USER -o pid,%cpu,%mem,start,time,bsdtime,command ; }

# ii: Display useful host-related information
# Usage: ii
# Displays: hostname, OS info, logged-in users, date, uptime, network location
# macOS specific: Uses scselect for network location
ii() {
  local RED=$(tput setaf 1)
  local NC=$(tput sgr0)
  echo -e "\nYou are logged on ${RED}$HOST${NC}"
  echo -e "\nAdditional information:${NC} " ; uname -a
  echo -e "\n${RED}Users logged on:${NC} " ; w -h
  echo -e "\n${RED}Current date :${NC} " ; date
  echo -e "\n${RED}Machine stats :${NC} " ; uptime
  echo -e "\n${RED}Current network location :${NC} " ; scselect
  echo
}

# ┌───────────────────────────────────────────────────────────────────┐
# │ AWS Profile Prompt                                                │
# └───────────────────────────────────────────────────────────────────┘
# Function to show AWS profile in prompt
aws_profile_prompt() {
    if [ -n "$AWS_PROFILE" ]; then
        case "$AWS_PROFILE" in
            "eng")
                echo -e "\033[38;2;23;122;253m[$AWS_PROFILE]\033[0m " # Using your 177afd color
                ;;
            "eng-stage")
                echo -e "\033[38;2;0;238;255m[$AWS_PROFILE]\033[0m " # Using your 00eeff color
                ;;
            "analytics")
                echo -e "\033[38;2;241;4;221m[$AWS_PROFILE]\033[0m " # Using your f104dd color
                ;;
            *)
                echo "[$AWS_PROFILE] "
                ;;
        esac
    fi
}

# Add to your prompt
export PS1='$(aws_profile_prompt)'"$PS1"

# ┌───────────────────────────────────────────────────────────────────┐
# │ macOS Specific Configuration                                      │
# └───────────────────────────────────────────────────────────────────┘
if [[ "$OSTYPE" == "darwin"* ]]; then
  # Misc macOS-specific aliases
  alias f='open -a Finder ./' # f: Opens current directory in MacOS Finder
  trash () { command mv "$@" ~/.Trash ; } # trash: Moves a file to the MacOS trash
  ql () { qlmanage -p "$*" >& /dev/null; } # ql: Opens any file in MacOS Quicklook Preview
  alias DT='tee ~/Desktop/terminalOut.txt' # DT: Pipe content to file on MacOS Desktop

  # cdf: Change directory to the frontmost Finder window
  # Usage: cdf
  # macOS specific: Uses AppleScript to interact with Finder
  # Falls back to Desktop if no Finder window is open
  cdf () {
    currFolderPath=$( /usr/bin/osascript <<EOT
    tell application "Finder"
    try
    set currFolder to (folder of the front window as alias)
    on error
    set currFolder to (path to desktop folder as alias)
    end try
    POSIX path of currFolder
    end tell
EOT
    )
    echo "cd to \"$currFolderPath\""
    cd "$currFolderPath"
  }

  # spotlight: Search for a file using MacOS Spotlight's metadata
  spotlight () { mdfind "kMDItemDisplayName == '$@'w"; }

  # NETWORKING macOS-specific
  alias flushDNS='dscacheutil -flushcache' # flushDNS: Flush out the DNS Cache
  alias ipInfo0='ipconfig getpacket en0' # ipInfo0: Get info on connections for en0
  alias ipInfo1='ipconfig getpacket en1' # ipInfo1: Get info on connections for en1
  alias showBlocked='sudo ipfw list' # showBlocked: All ipfw rules inc/ blocked IPs
fi

# ┌───────────────────────────────────────────────────────────────────┐
# │ Application & Tool Configuration                                  │
# └───────────────────────────────────────────────────────────────────┘

# fzf
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh

# ┌───────────────────────────────────────────────────────────────────┐
# │ Prompt Configuration                                              │
# └───────────────────────────────────────────────────────────────────┘

# Starship
eval "$(starship init zsh)"

# Added by LM Studio CLI (lms)
export PATH="$PATH:/Users/jdwork/.lmstudio/bin"
# End of LM Studio CLI section


# Added by Antigravity
export PATH="/Users/jdmini/.antigravity/antigravity/bin:$PATH"
