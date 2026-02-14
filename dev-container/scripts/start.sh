#!/bin/bash
# =============================================================================
# Three-Container Development Environment - Startup Helper
# =============================================================================
# Quick start script for the dev containers.
# SSH keys are managed inside each container (not forwarded from host).
#
# Usage:
#   ./start.sh              # Start all containers
#   ./start.sh dev-full     # Start specific container
#   ./start.sh --build      # Rebuild and start
# =============================================================================

set -e

cd "$(dirname "$0")/.."

# Parse arguments
BUILD_FLAG=""
CONTAINER=""

for arg in "$@"; do
    case $arg in
        --build)
            BUILD_FLAG="--build"
            ;;
        *)
            CONTAINER="$arg"
            ;;
    esac
done

echo "🐳 Three-Container Development Environment"
echo ""

if [ -n "$CONTAINER" ]; then
    echo "Starting: $CONTAINER"
    docker compose up -d $BUILD_FLAG "$CONTAINER"
else
    echo "Starting: all containers"
    docker compose up -d $BUILD_FLAG
fi

echo ""
echo "✅ Container(s) started!"
echo ""
echo "📋 Container Status:"
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "🔗 Connect via SSH:"
echo "   ssh dev-full        (port 2222) - Full development access"
echo "   ssh openclaw-agent  (port 2223) - AI agent (restricted)"
echo "   ssh opencode-web    (port 2224) - Web AI (restricted)"
echo ""
echo "📝 First-time setup:"
echo "   1. Watch logs: docker compose logs -f"
echo "   2. Add SSH keys shown to GitHub"
echo "   3. dev-full: Account key at github.com/settings/ssh/new"
echo "   4. Agents: Deploy keys at github.com/YOUR_USER/Dotfiles/settings/keys"
echo ""
echo "📊 View logs:   docker compose logs -f [container]"
echo "🛑 Stop:        docker compose stop"
echo ""
