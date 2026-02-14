# Three-Container AI Development Environment

Docker-based development environment with three container personas for different trust levels. Single Fedora 42 image, multiple security profiles.

## Overview

| Container | Ports | Trust Level | SSH Key Type | Status | Purpose |
|-----------|-------|-------------|--------------|--------|---------|
| **dev-full** | 2222 (SSH) | Full | Account key | ✅ Active | Personal hands-on development |
| **opencode-web** | 2224 (SSH)<br>4096 (Web) | Restricted | Deploy key | ✅ Active | Browser-based AI assistant |
| **openclaw-agent** | 2223 (SSH) | Restricted | Deploy key | ⏸️ Future | AI agent via messaging apps |

```
┌─────────────────────────────────────────────────────────────────────┐
│                          YOUR HOST                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Terminal ──SSH:2222──▶ dev-full        (full GitHub access)        │
│  Browser  ──HTTP:4096─▶ opencode-web    (web UI + restricted)       │
│            └─SSH:2224                                                │
│  Terminal ──SSH:2223──▶ openclaw-agent  (not yet configured)        │
│                                                                      │
│  ~/.env ────────────────▶ API keys (read-only bind mount)           │
│  ~/.ssh/dev_container.pub ──▶ SSH access into containers            │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
cd ~/Dotfiles/dev-container

# 1. Set up API keys
cp .env.example ~/.env
vim ~/.env  # Add your real API keys

# 2. Ensure SSH key exists for container access
# (You should already have ~/.ssh/dev_container from previous setup)
ls ~/.ssh/dev_container.pub

# 3. Build and start containers
docker compose build
docker compose up -d dev-full opencode-web  # Start active containers

# 4. Watch logs for SSH key setup instructions
docker compose logs -f

# 5. Access the containers
ssh dev-full                  # SSH to dev container
open http://localhost:4096    # Open OpenCode web UI
```

## Architecture

### Security Model

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SECURITY LAYERS                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Layer 4: GitHub Branch Protection                                   │
│  └── main branch requires PR + approval (deploy keys blocked)        │
│                                                                      │
│  Layer 3: SSH Keys                                                   │
│  └── Account key (all repos) vs Deploy key (Dotfiles only)          │
│                                                                      │
│  Layer 2: Cedar Policies (future Leash integration)                  │
│  └── File access, command execution, network allowlists             │
│                                                                      │
│  Layer 1: Container Isolation                                        │
│  └── Separate volumes, limited resources, network isolation         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Types

| Container | GitHub Key | What It Can Do |
|-----------|------------|----------------|
| dev-full | Account key | Push to any repo, any branch |
| openclaw-agent | Deploy key | Push to Dotfiles feature branches only |
| opencode-web | Deploy key | Push to Dotfiles feature branches only |

## Initial Setup

### Prerequisites

- Docker Desktop installed and running
- API keys:
  - Anthropic Claude (required): https://console.anthropic.com/
  - Tavily Search (required for MCP): https://tavily.com/
  - OpenRouter (optional): https://openrouter.ai/

### Step 1: Environment Variables

```bash
cp .env.example ~/.env
vim ~/.env
```

Required keys in `~/.env`:
```bash
ANTHROPIC_API_KEY=sk-ant-xxxxx
TAVILY_API_KEY=tvly-xxxxx
```

### Step 2: Host SSH Key

Your host needs a key to SSH into the containers:

```bash
# If you don't have ~/.ssh/dev_container yet:
ssh-keygen -t ed25519 -f ~/.ssh/dev_container -N '' -C 'dev-container-access'
```

### Step 3: Build and Start

```bash
docker compose build
docker compose up -d
```

### Step 4: Add GitHub SSH Keys

Each container generates its own key for GitHub operations. Watch the logs:

```bash
docker compose logs -f
```

For **dev-full** (first container):
1. Copy the public key shown in logs
2. Go to https://github.com/settings/ssh/new
3. Add as "Dev Container (Full Access)"

For **openclaw-agent** and **opencode-web**:
1. Copy each container's public key from logs
2. Go to https://github.com/YOUR_USERNAME/Dotfiles/settings/keys
3. Add as deploy key with "Allow write access" checked

### Step 5: Configure Branch Protection

Protect your main branch so agents can't push directly:

1. Go to: https://github.com/YOUR_USERNAME/Dotfiles/settings/branches
2. Add rule for `main` branch
3. Enable "Require a pull request before merging"

## Daily Usage

### SSH Config (Recommended)

Add to `~/.ssh/config`:

```ssh-config
Host dev-full
    HostName localhost
    Port 2222
    User dev
    IdentityFile ~/.ssh/dev_container
    IdentityAgent none
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null

Host openclaw-agent
    HostName localhost
    Port 2223
    User dev
    IdentityFile ~/.ssh/dev_container
    IdentityAgent none
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null

Host opencode-web
    HostName localhost
    Port 2224
    User dev
    IdentityFile ~/.ssh/dev_container
    IdentityAgent none
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
```

Then connect with:
```bash
ssh dev-full
ssh openclaw-agent
ssh opencode-web
```

### Container Management

```bash
# Start all containers
docker compose up -d

# Start specific container
docker compose up -d dev-full

# View logs
docker compose logs -f
docker compose logs -f dev-full

# Stop all
docker compose stop

# Restart
docker compose restart

# Remove containers (keeps volumes)
docker compose down

# Remove everything including data
docker compose down -v
```

### Inside Containers

```bash
# Connect to dev-full
ssh dev-full

# Start opencode CLI
opencode

# Your dotfiles are loaded
nvim  # Custom config
tmux  # Custom config
```

### OpenCode Web UI

The `opencode-web` container provides a browser-based interface:

```bash
# Access the web UI
open http://localhost:4096

# Or use SSH access
ssh opencode-web

# Web server auto-starts on container startup
# Check status: docker compose logs opencode-web
```

**Features:**
- Full OpenCode functionality in your browser
- Session management and history
- No terminal required
- Restricted GitHub access (deploy key, feature branches only)

**Note:** Currently localhost only. See [Future Enhancements](#future-enhancements) for Tailscale integration plans.

## File Structure

```
dev-container/
├── Dockerfile              # Fedora 42 base image (single image for all)
├── docker-compose.yml      # Three-container configuration
├── .env.example            # Template for API keys
├── scripts/
│   ├── entrypoint.sh       # Container startup (handles CONTAINER_TYPE)
│   ├── setup-dotfiles.sh   # Dotfiles installation
│   └── start.sh            # Helper script
├── policies/               # Cedar policies for Leash (future)
│   ├── schema.cedarschema  # Type definitions
│   ├── dev-full.cedar      # Full access policy
│   ├── openclaw-agent.cedar # Restricted agent policy
│   └── opencode-web.cedar  # Restricted web policy
└── docs/
    ├── ARCHITECTURE.md     # Detailed architecture docs
    └── TODO.md             # Implementation guide
```

## Volumes

Each container has isolated storage:

| Volume | Container | Contents |
|--------|-----------|----------|
| dev-full-home | dev-full | Projects, configs, caches |
| dev-full-ssh | dev-full | Account SSH key for GitHub |
| openclaw-home | openclaw-agent | Agent workspace |
| openclaw-ssh | openclaw-agent | Deploy key for Dotfiles |
| opencode-web-home | opencode-web | Web workspace |
| opencode-web-ssh | opencode-web | Deploy key for Dotfiles |

### Backup

```bash
# Backup dev-full home
docker run --rm -v dev-full-home:/data -v $(pwd):/backup \
  alpine tar czf /backup/dev-full-home.tar.gz -C /data .

# Restore
docker run --rm -v dev-full-home:/data -v $(pwd):/backup \
  alpine tar xzf /backup/dev-full-home.tar.gz -C /data
```

## Troubleshooting

### SSH Connection Refused

```bash
# Check container is running
docker compose ps

# Check SSH daemon
docker compose exec dev-full pgrep sshd

# View logs
docker compose logs dev-full
```

### GitHub Authentication Failed

```bash
# Check inside container
ssh dev-full
ssh -T git@github.com

# Should see:
# dev-full: "Hi YOUR_USERNAME! You've successfully authenticated..."
# agents: "Hi YOUR_USERNAME/Dotfiles! You've successfully authenticated..."

# If not, check key is added to GitHub
cat ~/.ssh/dev_full_ed25519.pub  # or openclaw_agent_ed25519.pub
```

### Agent Can't Push to Main

This is intentional! Agents should only push to feature branches:

```bash
# This should work:
git checkout -b feature/my-change
git push origin feature/my-change

# This should fail:
git checkout main
git push origin main
# Error: "protected branch hook declined"
```

### API Keys Not Loading

```bash
# Check .env exists on host
ls -la ~/.env

# Check it's mounted in container
docker compose exec dev-full cat /home/dev/.env

# Restart to reload
docker compose restart
```

## Cedar Policies (Future)

The `policies/` directory contains Cedar authorization policies for future Leash integration. When Leash is available:

1. Policies will be enforced at runtime
2. All actions are logged for audit
3. Defense-in-depth beyond GitHub's branch protection

See `docs/ARCHITECTURE.md` for detailed policy documentation.

## Future Enhancements

### Planned

- **Tailscale Serve Integration**: Expose opencode-web securely over Tailscale instead of localhost-only
  - Access web UI from anywhere on your tailnet
  - No port forwarding or public exposure needed
  - Automatic HTTPS with Tailscale certificates
  - See: https://tailscale.com/kb/1242/tailscale-serve

- **Openclaw Agent**: Configure the third container for messaging app integration
  - WhatsApp/Telegram bot access
  - Restricted to Dotfiles repo with deploy key
  - Same Cedar policies as opencode-web

### Under Consideration

- **Leash Integration**: When available, enforce Cedar policies at runtime
- **Multi-arch Support**: Test on AMD64 in addition to ARM64
- **Container Orchestration**: Kubernetes deployment for Mac Mini server

## Resources

- [Docker Compose docs](https://docs.docker.com/compose/)
- [Cedar Policy Language](https://www.cedarpolicy.com/)
- [Leash (when available)](https://github.com/anthropics/leash)
