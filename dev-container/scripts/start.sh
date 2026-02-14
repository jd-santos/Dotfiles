#!/bin/bash
# =============================================================================
# Docker Container Startup Helper
# =============================================================================
# Simplified script for starting the dev container
# SSH keys are managed inside the container (not forwarded from host)
# =============================================================================

set -e

echo "🚀 Starting Docker development container..."

# Go to docker directory
cd "$(dirname "$0")/.."

# Start docker-compose
docker compose up -d

echo ""
echo "✅ Container started successfully!"
echo ""
echo "📝 First time setup:"
echo "   The container will generate an SSH key on first run."
echo "   Follow the on-screen instructions to add it to GitHub."
echo ""
echo "🔗 Connect via: ssh -p 2222 dev@localhost"
echo "📊 View logs:   docker compose logs -f"
echo "🛑 Stop:        docker compose stop"
echo ""
