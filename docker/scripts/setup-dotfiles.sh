#!/bin/bash
# =============================================================================
# Dotfiles Setup Script
# =============================================================================
# This script is run during container build to install dotfiles
# It uses GNU Stow to symlink configurations to the home directory
# =============================================================================

set -e  # Exit on error

echo "📦 Setting up dotfiles..."

cd /home/dev/Dotfiles

# =============================================================================
# Stow Core Tools (Always Installed)
# =============================================================================

echo "🔧 Installing core tool configurations..."

# Git configuration
stow -v git

# Shell configuration (zsh + fzf)
stow -v zsh
stow -v fzf

# Terminal multiplexer
stow -v tmux

# Prompt
stow -v starship

# Neovim (will download plugins on first launch)
stow -v nvim

echo "✅ Core tools configured"

# =============================================================================
# Stow OpenCode Configuration
# =============================================================================

echo "🤖 Installing OpenCode configuration..."

# Always install core config (shared settings)
stow -v opencode-core

# Install context-specific config (home by default, work if specified)
CONTEXT="${OPENCODE_CONTEXT:-home}"
if [ "$CONTEXT" = "work" ]; then
    stow -v opencode-work
    echo "✅ OpenCode work configuration installed"
else
    stow -v opencode-home
    echo "✅ OpenCode home configuration installed"
fi

# =============================================================================
# Container-Specific Adjustments
# =============================================================================

echo "⚙️  Applying container-specific adjustments..."

# Disable cupertino MCP server in the config (not available in container)
# This will be re-applied at runtime in entrypoint.sh as well
if command -v jq &> /dev/null; then
    CONFIG_FILE="$HOME/.config/opencode/opencode.json"
    if [ -f "$CONFIG_FILE" ]; then
        TMP_FILE=$(mktemp)
        jq '.mcp.cupertino.enabled = false' "$CONFIG_FILE" > "$TMP_FILE"
        mv "$TMP_FILE" "$CONFIG_FILE"
        echo "✅ Disabled cupertino MCP server"
    fi
fi

# =============================================================================
# Initialize Shell Configuration
# =============================================================================

echo "🐚 Initializing shell environment..."

# Source zshrc to set up environment (this ensures paths are correct)
# Note: We're in bash, so we need to explicitly invoke zsh for this
/bin/zsh -c "source ~/.zshrc" 2>/dev/null || true

echo "✅ Shell environment initialized"

# =============================================================================
# Done
# =============================================================================

echo "🎉 Dotfiles setup complete!"
echo ""
echo "Installed configurations:"
echo "  - git"
echo "  - zsh + fzf"
echo "  - tmux"
echo "  - starship"
echo "  - neovim"
echo "  - opencode (core + $CONTEXT)"
