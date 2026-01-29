#!/bin/bash
# =============================================================================
# Opencode Container Entrypoint Script
# =============================================================================
# This script runs when the container starts and handles:
# - SSH key setup from host
# - Dotfiles updates
# - SSH daemon startup
# - Context switching (home/work)
# =============================================================================

set -e  # Exit on error

echo "🚀 Starting Opencode development container..."

# =============================================================================
# SSH Key Setup
# =============================================================================

echo "🔑 Setting up SSH keys..."

# Copy SSH keys from host mount (read-only) to writable location
if [ -d /home/dev/.ssh-host ]; then
    # Copy all SSH files
    cp -r /home/dev/.ssh-host/* /home/dev/.ssh/ 2>/dev/null || true
    
    # Fix permissions (SSH is picky about this)
    chmod 700 /home/dev/.ssh
    chmod 600 /home/dev/.ssh/* 2>/dev/null || true
    chmod 644 /home/dev/.ssh/*.pub 2>/dev/null || true
    chmod 600 /home/dev/.ssh/config 2>/dev/null || true
    
    # Ensure dev user owns everything
    chown -R dev:dev /home/dev/.ssh
    
    echo "✅ SSH keys configured"
else
    echo "⚠️  No SSH keys found at /home/dev/.ssh-host"
    echo "   You'll need to generate SSH keys inside the container or mount them."
fi

# =============================================================================
# Dotfiles Update
# =============================================================================

echo "📦 Checking for dotfiles updates..."

# Run as dev user
su - dev -c '
    cd ~/Dotfiles
    
    # Fetch latest changes
    git fetch origin main 2>/dev/null || true
    
    # Check if updates available
    LOCAL=$(git rev-parse HEAD)
    REMOTE=$(git rev-parse origin/main)
    
    if [ "$LOCAL" != "$REMOTE" ]; then
        echo "📥 Pulling latest dotfiles..."
        git pull origin main
        echo "✅ Dotfiles updated"
    else
        echo "✅ Dotfiles already up to date"
    fi
'

# =============================================================================
# Context Switching (Home vs Work)
# =============================================================================

CONTEXT="${OPENCODE_CONTEXT:-home}"
echo "🎯 Setting up OpenCode context: $CONTEXT"

su - dev -c "
    cd ~/Dotfiles
    
    # Unstow both contexts first (in case switching)
    stow -D opencode-home 2>/dev/null || true
    stow -D opencode-work 2>/dev/null || true
    
    # Stow the selected context
    if [ \"$CONTEXT\" = \"work\" ]; then
        stow opencode-work
        echo \"✅ Using work configuration\"
    else
        stow opencode-home
        echo \"✅ Using home configuration\"
    fi
    
    # Always stow core config (shared settings)
    stow opencode-core
"

# =============================================================================
# Update Opencode Config for Container Environment
# =============================================================================

echo "⚙️  Configuring Opencode for container environment..."

# Disable cupertino MCP server (not available in container)
su - dev -c '
    CONFIG_FILE="$HOME/.config/opencode/opencode.json"
    if [ -f "$CONFIG_FILE" ]; then
        # Use jq to disable cupertino if it exists
        if command -v jq &> /dev/null; then
            TMP_FILE=$(mktemp)
            jq ".mcp.cupertino.enabled = false" "$CONFIG_FILE" > "$TMP_FILE" 2>/dev/null || cp "$CONFIG_FILE" "$TMP_FILE"
            mv "$TMP_FILE" "$CONFIG_FILE"
            echo "✅ Disabled cupertino MCP server (not available in container)"
        fi
    fi
'

# =============================================================================
# Initialize Language Environments
# =============================================================================

echo "🔧 Initializing language environments..."

su - dev -c '
    # Ensure pyenv is initialized
    export PYENV_ROOT="$HOME/.pyenv"
    export PATH="$PYENV_ROOT/bin:$PATH"
    eval "$(pyenv init -)"
    
    # Ensure nvm is initialized
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    
    echo "✅ Python: $(python --version 2>&1 || echo \"Not configured\")"
    echo "✅ Node: $(node --version 2>&1 || echo \"Not configured\")"
    echo "✅ Go: $(go version 2>&1 || echo \"Not configured\")"
    echo "✅ Swift: $(swift --version 2>&1 | head -n1 || echo \"Not configured\")"
'

# =============================================================================
# Start SSH Daemon
# =============================================================================

echo "🔐 Starting SSH daemon..."

# Create required directories for SSH
mkdir -p /run/sshd

# Generate host keys if they don't exist
ssh-keygen -A

# Start SSH daemon
/usr/sbin/sshd -D &
SSHD_PID=$!

echo "✅ SSH daemon started (PID: $SSHD_PID)"
echo "🎉 Container ready! Connect via: ssh -p 2222 dev@localhost"
echo ""

# =============================================================================
# Keep Container Running
# =============================================================================

# If a command was passed, execute it as dev user
if [ $# -gt 0 ]; then
    echo "🔧 Executing command: $@"
    exec su - dev -c "$@"
else
    # Keep container running by waiting on SSH daemon
    wait $SSHD_PID
fi
