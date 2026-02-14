#!/bin/bash
# =============================================================================
# Three-Container Development Environment - Entrypoint Script
# =============================================================================
# This script handles container startup for all three container types:
#   - dev-full: Full personal development (account SSH key)
#   - openclaw-agent: AI agent via messaging (deploy key, restricted)
#   - opencode-web: Web-based AI assistant (deploy key, restricted)
#
# Behavior is controlled by the CONTAINER_TYPE environment variable.
# =============================================================================

# Note: Not using 'set -e' to allow container to start even if some steps fail

# Track setup status for final summary
FIRST_RUN=false
GITHUB_AUTH_OK=false
DOTFILES_OK=false
ENV_OK=false

# =============================================================================
# Container Identity
# =============================================================================

CONTAINER_TYPE="${CONTAINER_TYPE:-dev-full}"

# Map container type to SSH key name and settings
case "$CONTAINER_TYPE" in
    "dev-full")
        SSH_KEY_NAME="dev_full_ed25519"
        KEY_COMMENT="dev-container-full-access"
        GITHUB_KEY_TYPE="account"
        GITHUB_KEY_URL="https://github.com/settings/ssh/new"
        ;;
    "openclaw-agent")
        SSH_KEY_NAME="openclaw_agent_ed25519"
        KEY_COMMENT="openclaw-agent-dotfiles-deploy"
        GITHUB_KEY_TYPE="deploy"
        GITHUB_KEY_URL="https://github.com/jd-santos/Dotfiles/settings/keys"
        ;;
    "opencode-web")
        SSH_KEY_NAME="opencode_web_ed25519"
        KEY_COMMENT="opencode-web-dotfiles-deploy"
        GITHUB_KEY_TYPE="deploy"
        GITHUB_KEY_URL="https://github.com/jd-santos/Dotfiles/settings/keys"
        ;;
    *)
        echo "ERROR: Unknown CONTAINER_TYPE: $CONTAINER_TYPE"
        echo "Valid values: dev-full, openclaw-agent, opencode-web"
        exit 1
        ;;
esac

echo ""
echo "════════════════════════════════════════════════════════════════"
echo " ${CONTAINER_TYPE^^} CONTAINER"
echo "════════════════════════════════════════════════════════════════"
echo ""

# =============================================================================
# Phase 1: Host SSH Access (for SSHing INTO the container)
# =============================================================================

echo "[1/6] Host SSH Access"

# Ensure .ssh directory exists with correct permissions
mkdir -p /home/dev/.ssh
chmod 700 /home/dev/.ssh
chown dev:dev /home/dev/.ssh

# Check for bind-mounted authorized_keys from host
# This allows the host to SSH into the container
if [ -f /home/dev/.ssh/authorized_keys.d/host.pub ]; then
    # Copy host public key to authorized_keys
    cat /home/dev/.ssh/authorized_keys.d/host.pub > /home/dev/.ssh/authorized_keys
    chmod 600 /home/dev/.ssh/authorized_keys
    chown dev:dev /home/dev/.ssh/authorized_keys
    echo "      ✓ Host SSH key configured from bind mount"
elif [ -f /home/dev/.ssh/authorized_keys ] && [ -s /home/dev/.ssh/authorized_keys ]; then
    # authorized_keys already exists and is not empty (from volume)
    chmod 600 /home/dev/.ssh/authorized_keys
    chown dev:dev /home/dev/.ssh/authorized_keys
    echo "      ✓ Using existing authorized_keys from volume"
else
    echo "      ✗ No host SSH key found"
    echo "      • Bind mount ~/.ssh/dev_container.pub to /home/dev/.ssh/authorized_keys.d/host.pub"
    echo "      • Or manually add your public key to the container"
fi

# =============================================================================
# Phase 2: GitHub SSH Key (for git operations FROM the container)
# =============================================================================

echo ""
echo "[2/6] GitHub SSH Key ($GITHUB_KEY_TYPE key)"

# Generate container-specific SSH key for GitHub if it doesn't exist
SSH_KEY="/home/dev/.ssh/$SSH_KEY_NAME"
if [ ! -f "$SSH_KEY" ]; then
    FIRST_RUN=true
    echo "      → Generating new key: $SSH_KEY_NAME"
    su - dev -c "ssh-keygen -t ed25519 -f $SSH_KEY -N '' -C '$KEY_COMMENT'" > /dev/null 2>&1
    echo ""
    echo "      ┌─ ACTION REQUIRED ─────────────────────────────────────┐"
    echo "      │                                                        │"
    if [ "$GITHUB_KEY_TYPE" = "account" ]; then
        echo "      │  Add this ACCOUNT KEY to GitHub:                      │"
        echo "      │  $GITHUB_KEY_URL              │"
        echo "      │                                                        │"
        echo "      │  Title: Dev Container (Full Access)                   │"
    else
        echo "      │  Add this DEPLOY KEY to Dotfiles repo:                │"
        echo "      │  $GITHUB_KEY_URL    │"
        echo "      │                                                        │"
        echo "      │  Title: $CONTAINER_TYPE                               │"
        echo "      │  ⚠️  Check 'Allow write access'                        │"
    fi
    echo "      │                                                        │"
    echo "      │  Key:                                                 │"
    cat "${SSH_KEY}.pub" | sed 's/^/      │  /'
    echo "      │                                                        │"
    echo "      └────────────────────────────────────────────────────────┘"
    echo ""
else
    echo "      ✓ Key exists: $SSH_KEY_NAME"
fi

# Ensure correct permissions on all SSH key files
chmod 600 "$SSH_KEY" 2>/dev/null || true
chmod 644 "${SSH_KEY}.pub" 2>/dev/null || true
chown dev:dev "$SSH_KEY" "${SSH_KEY}.pub" 2>/dev/null || true

# Create SSH config pointing to the correct key
cat > /home/dev/.ssh/config << EOF
# SSH Configuration for $CONTAINER_TYPE
# Auto-generated by entrypoint.sh - edits will be overwritten

Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/$SSH_KEY_NAME
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

# =============================================================================
# Phase 3: GitHub Connection Test
# =============================================================================

echo ""
echo "[3/6] GitHub Connection"

# Test SSH connection to GitHub
GITHUB_TEST=$(su - dev -c 'ssh -T git@github.com 2>&1')
if echo "$GITHUB_TEST" | grep -q "successfully authenticated"; then
    if [ "$GITHUB_KEY_TYPE" = "account" ]; then
        GITHUB_USERNAME=$(echo "$GITHUB_TEST" | sed -n 's/.*Hi \([^!]*\)!.*/\1/p')
        echo "      ✓ Authenticated as $GITHUB_USERNAME (account key)"
    else
        REPO_NAME=$(echo "$GITHUB_TEST" | sed -n 's/.*Hi \([^!]*\)!.*/\1/p')
        echo "      ✓ Authenticated for $REPO_NAME (deploy key)"
    fi
    GITHUB_AUTH_OK=true
else
    if [ "$FIRST_RUN" = true ]; then
        echo "      ✗ Not authenticated (expected on first run)"
        echo "      • Add the key shown above to GitHub, then restart"
    else
        echo "      ✗ Authentication failed"
        echo "      • Check that SSH key is added to GitHub"
        echo "      • Key type: $GITHUB_KEY_TYPE"
        echo "      • URL: $GITHUB_KEY_URL"
    fi
fi

# =============================================================================
# Phase 4: Dotfiles Setup
# =============================================================================

echo ""
echo "[4/6] Dotfiles"

if [ ! -d /home/dev/Dotfiles ]; then
    echo "      → Cloning from github.com/jd-santos/Dotfiles"
    if su - dev -c 'git clone git@github.com:jd-santos/Dotfiles.git ~/Dotfiles' > /dev/null 2>&1; then
        echo "      ✓ Cloned successfully"
        DOTFILES_OK=true
    else
        echo "      ✗ Clone failed"
        if [ "$FIRST_RUN" = true ]; then
            echo "      • Add SSH key to GitHub and restart container"
        else
            echo "      • Check GitHub authentication above"
        fi
    fi
else
    echo "      ✓ Already present at ~/Dotfiles"
    DOTFILES_OK=true
fi

# =============================================================================
# Phase 5: Environment & Configuration
# =============================================================================

echo ""
echo "[5/6] Environment"

# Source .env file if it exists (bind-mounted from host)
if [ -f /home/dev/.env ]; then
    # Export all variables from .env file
    set -a
    source /home/dev/.env
    set +a
    echo "      ✓ Loaded API keys from ~/.env"
    ENV_OK=true
else
    echo "      ✗ No .env file found"
    echo "      • Create ~/.env on host with API keys"
    echo "      • See dev-container/.env.example for format"
fi

# Stow dotfiles if available
if [ -d /home/dev/Dotfiles ]; then
    # All stow packages in the dotfiles repo
    STOW_PACKAGES="claude fzf ghostty git nvim opencode pgcli starship tmux zed zsh"
    
    # Back up and remove conflicting files before stowing
    STOW_OUTPUT=$(su - dev -c "
        cd ~/Dotfiles
        
        # Create backup dir with timestamp
        BACKUP_DIR=~/.dotfiles-backup-\$(date +%Y%m%d-%H%M%S)
        mkdir -p \$BACKUP_DIR
        HAS_BACKUPS=false
        
        # Move conflicting files to backup (if they exist and aren't symlinks)
        for f in ~/.zshrc ~/.fzf.zsh ~/.tmux.conf ~/.gitconfig ~/.config/starship.toml ~/.vimrc ~/.pgclirc; do
            if [ -f \"\$f\" ] && [ ! -L \"\$f\" ]; then
                mv \"\$f\" \$BACKUP_DIR/ 2>/dev/null
                HAS_BACKUPS=true
            fi
        done
        for d in ~/.config/nvim ~/.config/opencode ~/.config/ghostty ~/.config/zed ~/.claude; do
            if [ -d \"\$d\" ] && [ ! -L \"\$d\" ]; then
                mv \"\$d\" \$BACKUP_DIR/ 2>/dev/null
                HAS_BACKUPS=true
            fi
        done
        
        # Remove backup dir if empty
        if [ \"\$HAS_BACKUPS\" = false ]; then
            rmdir \$BACKUP_DIR 2>/dev/null
        fi
        
        # Stow all packages
        stow $STOW_PACKAGES 2>&1
    " 2>&1)

    if [ $? -eq 0 ]; then
        echo "      ✓ Stowed: $STOW_PACKAGES"
    else
        echo "      ✗ Stow failed"
        echo "$STOW_OUTPUT" | head -5 | sed 's/^/      • /'
    fi

    # Disable cupertino MCP server (not available in container)
    su - dev -c '
        CONFIG_FILE="$HOME/.config/opencode/opencode.json"
        if [ -f "$CONFIG_FILE" ]; then
            if command -v jq &> /dev/null; then
                TMP_FILE=$(mktemp)
                jq ".mcp.cupertino.enabled = false" "$CONFIG_FILE" > "$TMP_FILE" 2>/dev/null || cp "$CONFIG_FILE" "$TMP_FILE"
                mv "$TMP_FILE" "$CONFIG_FILE"
            fi
        fi
    ' > /dev/null 2>&1
    echo "      ✓ Configured for container (cupertino disabled)"

    # Initialize language environments
    LANG_VERSIONS=$(su - dev -c '
        export PYENV_ROOT="$HOME/.pyenv"
        export PATH="$PYENV_ROOT/bin:$PATH"
        eval "$(pyenv init -)" 2>/dev/null
        
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" 2>/dev/null
        
        echo "Python $(python --version 2>&1 | cut -d\" \" -f2), Node $(node --version 2>&1), Go $(go version 2>&1 | cut -d\" \" -f3)"
    ' 2>/dev/null)
    echo "      ✓ Languages: $LANG_VERSIONS"
fi

# =============================================================================
# Phase 6: Start Services
# =============================================================================

echo ""
echo "[6/6] Services"

# Create required directories for SSH
mkdir -p /run/sshd

# Generate host keys if they don't exist (Fedora may need this)
ssh-keygen -A > /dev/null 2>&1

# Start SSH daemon
/usr/sbin/sshd -D &
SSHD_PID=$!

echo "      ✓ SSH daemon running (PID: $SSHD_PID)"

# Start OpenCode web server for opencode-web container
if [ "$CONTAINER_TYPE" = "opencode-web" ] && [ "$DOTFILES_OK" = true ]; then
    echo "      → Starting OpenCode web server..."
    
    # Start opencode web server as dev user in background
    # Note: Redirection must be outside bash -c quotes, & at the very end
    su - dev -c 'cd /tmp && setsid bash -c "source ~/.nvm/nvm.sh && opencode web --port 4096 --hostname 0.0.0.0" > /tmp/opencode-web.log 2>&1 &'
    
    # Give it time to start
    sleep 6
    
    # Check if running
    if pgrep -f "opencode web" > /dev/null; then
        echo "      ✓ OpenCode web server running on port 4096"
    else
        echo "      ✗ Web server failed (check: docker compose exec opencode-web cat /tmp/opencode-web.log)"
    fi
fi

# =============================================================================
# Final Summary
# =============================================================================

echo ""
echo "════════════════════════════════════════════════════════════════"

# Determine port based on container type
case "$CONTAINER_TYPE" in
    "dev-full")      SSH_PORT="2222" ;;
    "openclaw-agent") SSH_PORT="2223" ;;
    "opencode-web")   SSH_PORT="2224" ;;
esac

if [ "$FIRST_RUN" = true ]; then
    echo " WAITING — Add SSH key to GitHub, then: docker compose restart"
    echo ""
    echo " Key type: $GITHUB_KEY_TYPE"
    echo " Add at:   $GITHUB_KEY_URL"
elif [ "$DOTFILES_OK" = true ] && [ "$ENV_OK" = true ]; then
    if [ "$CONTAINER_TYPE" = "opencode-web" ]; then
        echo " READY — Web UI: http://localhost:4096"
        echo "         SSH:    ssh -p $SSH_PORT dev@localhost"
    else
        echo " READY — ssh -p $SSH_PORT dev@localhost"
    fi
else
    echo " PARTIAL — Container running, but setup incomplete"
    [ "$DOTFILES_OK" = false ] && echo " • Fix dotfiles (check GitHub SSH above)"
    [ "$ENV_OK" = false ] && echo " • Add ~/.env file on host"
fi

echo "════════════════════════════════════════════════════════════════"
echo ""

# =============================================================================
# Keep Container Running
# =============================================================================

# If a command was passed, execute it as dev user
if [ $# -gt 0 ]; then
    echo "Executing command: $@"
    exec su - dev -c "$@"
else
    # Keep container running by waiting on SSH daemon
    wait $SSHD_PID
fi
