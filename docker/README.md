# 🐳 Opencode Development Container

Docker container with Opencode and my dotfiles. Includes Python, Node.js, and Go, with SSH access and persistent storage for projects.

## Table of Contents

- [Quick Start](#-quick-start)
- [Architecture](#-architecture)
- [Prerequisites](#-prerequisites)
- [Initial Setup](#-initial-setup)
- [Daily Usage](#-daily-usage)
- [Configuration](#-configuration)
- [Troubleshooting](#-troubleshooting)
- [Advanced Topics](#-advanced-topics)
- [FAQ](#-faq)

## Quick Start

```bash
# 1. Navigate to the docker directory
cd ~/Dotfiles/docker

# 2. Copy environment template to your home directory and add your API keys
cp .env.example ~/.env
vim ~/.env  # Add your real API keys

# 3. Build and start the container with SSH agent support (takes ~10 minutes first time)
./scripts/start.sh

# Alternative: Start manually without helper script
docker compose up -d

# 4. Connect via SSH
ssh -p 2222 dev@localhost
# When prompted, accept the host key (type 'yes')

# 5. Inside container - start using Opencode!
opencode
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    HOST (macOS)                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Terminal ────────SSH:2222──▶ Container                │
│                                                         │
│  ~/.env ──────────────────────▶ Environment Variables   │
│  (API Keys - bind mounted read-only)                    │
│                                                         │
│  Docker Volumes (persisted):                            │
│    • opencode-home ──────────▶ /home/dev                │
│      (projects, caches, configs, history)               │
│    • ssh-keys ───────────────▶ /home/dev/.ssh           │
│      (dev_container_ed25519 key pair)                   │
│                                                         │
│                           GitHub ◀──SSH──┐              │
│                           (authenticated) │             │
└───────────────────────────────────────────┴─────────────┘
```

## Prerequisites

- **Docker Desktop** - [Download](https://www.docker.com/products/docker-desktop) and make sure it's running
- **API Keys** you'll need:
  - Anthropic Claude (required) - [Get key](https://console.anthropic.com/)
  - Tavily Search (required for MCP) - [Get key](https://tavily.com/)
  - OpenRouter (optional) - [Get key](https://openrouter.ai/)
  - Google AI (optional) - [Get key](https://makersuite.google.com/app/apikey)

## Initial Setup

### Step 1: Environment Configuration

```bash
cd ~/Dotfiles/docker

# Copy the template to your home directory
cp .env.example ~/.env

# Edit with your API keys
vim ~/.env
```

Your `~/.env` file lives in your home directory (on a separate device), not in the git repo. It gets bind-mounted read-only into the container.

Example `~/.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-your-actual-key-here
TAVILY_API_KEY=tvly-your-actual-key-here
OPENROUTER_API_KEY=sk-or-your-actual-key-here
OPENCODE_CONTEXT=home
```

### Step 2: SSH Key Setup

The container uses a dedicated SSH key for GitHub operations. On first startup:

1. **The container generates a dedicated SSH key** (`dev_container_ed25519`) with no passphrase
2. **You add the public key to GitHub** - the startup script will display it and pause
3. **The key persists in a Docker volume** - survives container recreation
4. **All git operations just work** - no agent forwarding needed

**Why this approach?**
- ✅ Simple and reliable - no complex agent forwarding
- ✅ Secure - key is isolated to the container, not your main account key
- ✅ Revocable - you can remove just this key from GitHub if needed
- ✅ Works on any Docker host - no macOS-specific setup

**Security note:** The key has no passphrase because:
- It's stored in a Docker volume on your local machine only
- It's purpose-specific (just for this dev container)
- You can revoke it anytime on GitHub
- It's essentially like having a passphrase-less key on a Linux workstation you own

### Step 3: Build the Container

```bash
# This will take ~10-15 minutes on first build
# Docker downloads Ubuntu, installs tools, language runtimes, etc.
docker compose build

# Watch the build process - layers are cached for future rebuilds
```

### Step 4: Start the Container

```bash
# Start with helper script (recommended)
./scripts/start.sh

# Or start manually
docker compose up -d

# Watch the startup logs (important for first run!)
docker compose logs -f

# Look for: "Container ready! Connect via: ssh -p 2222 dev@localhost"
# Press Ctrl+C to exit logs (container keeps running)
```

### Step 5: SSH Configuration (optional but nice)

Add this to your `~/.ssh/config` for easier access:

```ssh-config
Host opencode
    HostName localhost
    Port 2222
    User dev
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
```

Now you can connect with just: `ssh opencode`

### Step 5: First-Run SSH Key Setup

On first startup, the container will:

1. Generate a new SSH key pair (`dev_container_ed25519`)
2. Display the public key
3. Pause and wait for you to add it to GitHub

**Follow these steps:**

```bash
# 1. Watch the logs to see the key
docker compose logs -f

# You'll see output like:
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ⚠️  ACTION REQUIRED: Add this public key to GitHub
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 
# 1. Go to: https://github.com/settings/ssh/new
# 2. Title: Docker Dev Container
# 3. Key:
# 
# ssh-ed25519 AAAA...your-key-here... docker-dev-container

# 2. Copy the ssh-ed25519 key from the logs

# 3. Go to GitHub and add it:
# - Visit: https://github.com/settings/ssh/new
# - Title: "Docker Dev Container"
# - Paste the key
# - Click "Add SSH Key"

# 4. Return to terminal and press Enter
# The container will test the connection and continue setup
```

**Important:** This is a one-time setup. The key persists in the `ssh-keys` Docker volume, so you won't need to do this again unless you delete the volume.

## Daily Usage

### Starting/Stopping

```bash
# Start container (if stopped)
docker compose start

# Stop container (preserves all data)
docker compose stop

# Restart container
docker compose restart

# View status
docker compose ps
```

### Connecting

```bash
# Via SSH (recommended)
ssh -p 2222 dev@localhost

# Or if you configured the SSH alias:
ssh opencode

# Once connected, you're in zsh with all your dotfiles!
```

### Inside the Container

```bash
# Start Opencode
opencode

# Navigate to your projects
cd ~/projects

# Clone a repo
git clone git@github.com:username/repo.git
cd repo

# Use Opencode with the repo
opencode

# Your zsh aliases and functions work!
ls          # Uses your custom ls alias
cat file    # Uses bat (your cat override)
..          # cd .. alias works
```

### Working with Projects

```bash
# Clone repos as needed
cd ~/projects
git clone git@github.com:you/your-project.git
cd your-project

# Install dependencies
npm install    # Node projects
pip install -r requirements.txt    # Python projects
go mod download    # Go projects

# Use Opencode to work on the code
opencode
```

## Configuration

### Switching Context (Home vs Work)

Edit `~/.env` on your host machine:

```bash
# For personal projects
OPENCODE_CONTEXT=home

# For work projects
OPENCODE_CONTEXT=work
```

Then restart:

```bash
docker compose restart
```

This switches which agent configurations Opencode loads from `opencode-home` or `opencode-work`.

### Updating Dotfiles

The container automatically checks for dotfile updates on startup. To manually update:

```bash
# Inside container
cd ~/Dotfiles
git pull
stow -R git zsh fzf tmux starship nvim opencode-core opencode-home
```

Or rebuild the container to get latest:

```bash
# On host
docker compose build --no-cache
docker compose up -d
```

### Resource Limits

Edit `docker-compose.yml` to adjust CPU/memory:

```yaml
deploy:
  resources:
    limits:
      cpus: '4'      # Change this
      memory: 8G     # Change this
```

## Troubleshooting

### SSH Connection Refused

```bash
# Check if container is running
docker compose ps

# If not running:
docker compose up -d

# Check SSH daemon is running
docker compose exec opencode pgrep sshd

# View container logs
docker compose logs -f
```

### Permission Errors

```bash
# Fix SSH key permissions
ssh -p 2222 dev@localhost
chmod 700 ~/.ssh
chmod 600 ~/.ssh/id_*
chmod 644 ~/.ssh/*.pub
```

### Git Operations Fail (Permission Denied)

```bash
# Test SSH connection to GitHub
docker compose exec -u dev opencode ssh -T git@github.com

# You should see: "Hi username! You've successfully authenticated..."

# If it fails, check if the key is in GitHub:
# 1. Get the public key from container:
docker compose exec -u dev opencode cat ~/.ssh/dev_container_ed25519.pub

# 2. Verify it's on GitHub: https://github.com/settings/keys
# 3. If not, add it (see Step 5 above)

# If key is there but still fails, regenerate:
docker compose exec -u dev opencode rm ~/.ssh/dev_container_ed25519*
docker compose restart
# Follow the prompts to add new key to GitHub
```

### View SSH Key

```bash
# See the public key that should be on GitHub
docker compose exec -u dev opencode cat ~/.ssh/dev_container_ed25519.pub
```

### Can't Clone/Push Private Repos

Your SSH keys might not be properly mounted:

```bash
# On host - check SSH keys exist
ls -la ~/.ssh/

# In container - check they're accessible
ssh -p 2222 dev@localhost
ls -la ~/.ssh/
ssh -T git@github.com  # Test GitHub access
```

### Opencode Can't Find API Keys

```bash
# Verify environment variables are loaded
docker compose exec opencode env | grep API_KEY

# If missing, check ~/.env exists on your host
ls -la ~/.env

# Verify it's bind-mounted correctly
docker compose exec opencode ls -la /home/dev/.env

# Restart container to reload env vars
docker compose restart
```

### Container Won't Start

```bash
# View detailed logs
docker compose logs

# Common issues:
# 1. Port 2222 already in use
#    Solution: Change port in docker-compose.yml
# 2. Docker out of disk space
#    Solution: docker system prune
# 3. Invalid ~/.env syntax
#    Solution: Check for quotes/spaces in env file
# 4. ~/.env file missing
#    Solution: cp ~/Dotfiles/docker/.env.example ~/.env
```

### Neovim Plugins Not Loading

First launch triggers plugin download:

```bash
# Inside container
nvim

# Wait for lazy.nvim to install plugins (~1-2 minutes)
# Quit and restart nvim
```

## Advanced Topics

### Backing Up Your Work

```bash
# Backup home volume (includes projects, caches, configs)
docker run --rm \
  -v opencode-home:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/home-backup.tar.gz /data
```

### Restoring from Backup

```bash
docker run --rm \
  -v opencode-home:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/home-backup.tar.gz -C /
```

### Running Commands Without SSH

```bash
# Execute a command in the running container
docker compose exec opencode opencode --version

# Start a shell session
docker compose exec opencode zsh

# Run as root (for system changes)
docker compose exec -u root opencode bash
```

### Installing Additional Tools

```bash
# Inside container
sudo apt-get update
sudo apt-get install <package>

# Or add to Dockerfile for permanent install
```

### Exposing Web Application Ports

Edit `docker-compose.yml`:

```yaml
ports:
  - "2222:22"      # SSH
  - "3000:3000"    # React/Next.js dev server
  - "8000:8000"    # Python Flask/Django
  - "8080:8080"    # Go web app
```

### Complete Reset

```bash
# Stop and remove container
docker compose down

# Remove all volumes (DELETES ALL DATA!)
docker compose down -v

# Remove image
docker rmi opencode-dev

# Start fresh
docker compose up -d
```

## FAQ

**VS Code?** Yes, use the "Remote - SSH" extension and connect to `localhost:2222`. The container is set up for terminal workflows though.

**Disk space?** Base image is ~2GB, with language runtimes it's ~4-5GB, plus whatever projects and caches you add.

**What about my host SSH key with 1Password?** The container uses its own dedicated key (`dev_container_ed25519`). Your host key with 1Password stays on the host and is used for your normal git operations there. This separation is intentional for security.

**Why not forward the SSH agent?** Docker Desktop for Mac doesn't support Unix socket forwarding properly. The container-specific key approach is simpler, more reliable, and more portable.

**Is the passphrase-less key secure?** Yes, for this use case. It's stored in a Docker volume on your local machine only, it's purpose-specific (just for this container), and you can revoke it anytime on GitHub. It's like having a deploy key.

**Docker-in-Docker?** Not by default. If you need it, uncomment the Docker socket mount in `docker-compose.yml`.

**Windows/Linux?** Should work fine. You'll need to adjust bind mount paths (Windows uses different syntax).

**Update Python/Node/Go?** Edit the version variables in `Dockerfile`:
```dockerfile
ENV GO_VERSION="1.24.0"
ENV NODE_VERSION="23.0.0"
```
Then rebuild: `docker compose build --no-cache`

**Custom MCP servers?** Install them in the Dockerfile or mount as volumes, then update your Opencode config.

**Skip SSH?** You can use `docker compose exec opencode zsh`, but SSH gives better terminal emulation.

## Resources

- [Docker Compose docs](https://docs.docker.com/compose/)
- [Opencode docs](https://github.com/opencodetorch/opencode)
- [GNU Stow guide](https://www.gnu.org/software/stow/manual/stow.html)

## Getting Help

Check the troubleshooting section above, or review container logs with `docker compose logs`.
