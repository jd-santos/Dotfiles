# Quick Start - Opencode Dev Container

## First Time Setup

```bash
# 1. Go to docker directory
cd ~/Dotfiles/docker

# 2. Create your secrets file in home directory
cp .env.example ~/.env

# 3. Edit and add your API keys
vim ~/.env
# Add your real ANTHROPIC_API_KEY, TAVILY_API_KEY, etc.

# 4. Optional: Configure Obsidian path in docker-compose.yml
# Uncomment and update this line:
# - ~/Documents/Obsidian:/home/dev/Obsidian

# 5. Build (takes ~10 minutes first time)
docker compose build

# 6. Start the container
docker compose up -d

# 7. Connect via SSH
ssh -p 2222 dev@localhost
# Uses your SSH key (no password needed)
```

## Daily Commands

```bash
# Start container
docker compose start

# Connect
ssh -p 2222 dev@localhost

# Stop container (saves your work)
docker compose stop

# View logs
docker compose logs -f

# Restart
docker compose restart
```

## Inside Container

```bash
# Start Opencode
opencode

# Your projects
cd ~/projects

# Clone a repo
git clone git@github.com:you/repo.git

# All your zsh aliases work!
ls    # Uses bat
..    # Go up directory
```

## Troubleshooting

```bash
# Not starting?
docker compose logs

# SSH not working?
docker compose ps

# Reset everything (DELETES DATA!)
docker compose down -v
```

## Next Steps

- Read [README.md](README.md) for complete documentation
- Configure SSH alias in `~/.ssh/config` for easier access
- Adjust resource limits in `docker-compose.yml`
