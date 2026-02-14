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

# Note: Not using 'set -e' to allow container to start even if dotfiles fail

echo "🚀 Starting Opencode development container..."

# =============================================================================
# SSH Key Setup
# =============================================================================

echo "🔑 Setting up SSH keys..."

# Ensure .ssh directory exists with correct permissions
mkdir -p /home/dev/.ssh
chmod 700 /home/dev/.ssh
chown dev:dev /home/dev/.ssh

# Generate container-specific SSH key if it doesn't exist
SSH_KEY="/home/dev/.ssh/dev_container_ed25519"
if [ ! -f "$SSH_KEY" ]; then
    echo "🔐 Generating container-specific SSH key (dev_container_ed25519)..."
    su - dev -c "ssh-keygen -t ed25519 -f $SSH_KEY -N '' -C 'docker-dev-container'"
    echo ""
    echo "✅ SSH key generated!"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "⚠️  ACTION REQUIRED: Add this public key to GitHub"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "1. Go to: https://github.com/settings/ssh/new"
    echo "2. Title: Docker Dev Container"
    echo "3. Key:"
    echo ""
    cat "${SSH_KEY}.pub"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Press Enter after adding the key to GitHub..."
    read -r
else
    echo "✅ Container SSH key exists: dev_container_ed25519"
fi

# Create SSH config
cat > /home/dev/.ssh/config << 'EOF'
# Container SSH Configuration (auto-generated)
# This uses the container-specific SSH key for all GitHub operations

Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/dev_container_ed25519
    IdentitiesOnly yes

Host *
    AddKeysToAgent no
    StrictHostKeyChecking accept-new
EOF

chmod 600 /home/dev/.ssh/config
chown dev:dev /home/dev/.ssh/config

# Add GitHub to known_hosts (avoid host key verification prompt)
su - dev -c 'ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null'
chmod 600 /home/dev/.ssh/known_hosts 2>/dev/null || true
chown dev:dev /home/dev/.ssh/known_hosts 2>/dev/null || true

echo "✅ SSH configuration complete"

# Test SSH connection to GitHub
echo "🧪 Testing GitHub SSH connection..."
if su - dev -c 'ssh -T git@github.com 2>&1' | grep -q "successfully authenticated"; then
    echo "✅ GitHub SSH authentication successful!"
else
    echo "⚠️  GitHub SSH authentication not yet configured"
    echo "   Make sure you've added the public key to GitHub (see above)"
fi

# =============================================================================
# Dotfiles Setup
# =============================================================================

echo "📦 Checking for dotfiles..."

if [ ! -d /home/dev/Dotfiles ]; then
    echo "🔄 Cloning dotfiles from GitHub..."
    if su - dev -c 'git clone git@github.com:jdwork/Dotfiles.git ~/Dotfiles' 2>&1; then
        echo "✅ Dotfiles cloned successfully"
    else
        echo "⚠️  Failed to clone dotfiles"
        echo "   Make sure you've added the SSH key to GitHub (see above)"
        echo "   Or clone manually: git clone git@github.com:jdwork/Dotfiles.git ~/Dotfiles"
    fi
else
    echo "✅ Dotfiles already present"
fi

# =============================================================================
# Environment Variables Setup
# =============================================================================

echo "🔑 Loading environment variables..."

# Source .env file if it exists (bind-mounted from host)
if [ -f /home/dev/.env ]; then
    # Export all variables from .env file
    set -a  # Automatically export all variables
    source /home/dev/.env
    set +a  # Turn off automatic export
    echo "✅ Loaded environment variables from ~/.env"
else
    echo "⚠️  No .env file found at /home/dev/.env"
    echo "   Create ~/.env on your host with your API keys"
    echo "   See docker/.env.example for the required format"
fi

# =============================================================================
# Context Switching (Home vs Work)
# =============================================================================

if [ -d /home/dev/Dotfiles ]; then
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
else
    echo "⚠️  Dotfiles not available - skipping configuration"
fi

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
# Rebuilt: Mon Feb  2 13:06:18 CST 2026
# Update 1770059308
