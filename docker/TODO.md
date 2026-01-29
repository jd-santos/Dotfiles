# 📋 Docker Container Setup - TODO

Follow these steps to get your Opencode dev container up and running.

## ☐ Initial Setup

### 1. Configure API Keys
- [ ] Copy environment template: `cp .env.container.example .env.container`
- [ ] Get Anthropic API key from https://console.anthropic.com/
- [ ] Get Tavily API key from https://tavily.com/
- [ ] (Optional) Get OpenRouter key from https://openrouter.ai/
- [ ] (Optional) Get Google AI key from https://makersuite.google.com/app/apikey
- [ ] Edit `.env.container` with your real keys
- [ ] Verify `.env.container` is gitignored: `git check-ignore docker/.env.container`

### 2. Optional: Configure Obsidian Sync
- [ ] Locate your Obsidian vault path (e.g., `~/Documents/Obsidian`)
- [ ] Edit `docker-compose.yml`
- [ ] Uncomment and update the Obsidian bind mount line
- [ ] Save the file

### 3. Optional: Configure SSH Alias
- [ ] Add SSH config entry to `~/.ssh/config`:
```
Host opencode
    HostName localhost
    Port 2222
    User dev
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
```
- [ ] Test: `ssh opencode` should work after container starts

## ☐ Build and Launch

### 4. Build the Container
- [ ] Navigate to docker directory: `cd ~/Dotfiles/docker`
- [ ] Build image: `docker compose build` (takes ~10-15 minutes first time)
- [ ] Watch for errors - all steps should complete successfully
- [ ] Verify image created: `docker images | grep opencode`

### 5. Start the Container
- [ ] Start in detached mode: `docker compose up -d`
- [ ] Check container status: `docker compose ps` (should show "running")
- [ ] View startup logs: `docker compose logs -f`
- [ ] Look for: "Container ready! Connect via: ssh -p 2222 dev@localhost"
- [ ] Press `Ctrl+C` to exit logs (container keeps running)

### 6. Connect via SSH
- [ ] Connect: `ssh -p 2222 dev@localhost` (or `ssh opencode` if configured)
- [ ] Accept host key on first connection (type `yes`)
- [ ] Verify you're in zsh shell
- [ ] Check prompt shows starship theme

## ☐ Verify Setup

### 7. Test Development Environment
- [ ] Check Python: `python --version` (should show 3.12.x)
- [ ] Check Node: `node --version` (should show 22.x)
- [ ] Check Go: `go version` (should show 1.23.x)
- [ ] Check Neovim: `nvim --version` (should work, plugins load on first launch)
- [ ] Check Opencode: `opencode --version`

### 8. Test Opencode Configuration
- [ ] Run: `opencode`
- [ ] Verify it starts without errors
- [ ] Check your dotfiles are loaded (theme, model settings)
- [ ] Test basic prompt: "What's your default model?"
- [ ] Verify response shows `claude-sonnet-4-5`
- [ ] Exit Opencode (type `/exit` or `Ctrl+C`)

### 9. Test Git Integration
- [ ] Check git config: `git config --list`
- [ ] Test GitHub SSH: `ssh -T git@github.com`
- [ ] Should see: "Hi [username]! You've successfully authenticated"
- [ ] If fails, check SSH key mounting in docker-compose.yml

### 10. Test Project Workflow
- [ ] Create test directory: `cd ~/projects && mkdir test-project && cd test-project`
- [ ] Initialize git: `git init`
- [ ] Create file: `echo "console.log('Hello from container')" > test.js`
- [ ] Start Opencode: `opencode`
- [ ] Ask Opencode to explain the file
- [ ] Verify it can read and respond

## ☐ Optional Enhancements

### 11. Resource Tuning (if needed)
- [ ] Monitor resource usage: `docker stats opencode-dev`
- [ ] If slow, adjust CPU/memory limits in `docker-compose.yml`
- [ ] Restart: `docker compose restart`

### 12. Backup Setup (recommended)
- [ ] Test backup command (from docker/ directory):
```bash
docker run --rm -v opencode-projects:/data -v $(pwd):/backup \
  alpine tar czf /backup/projects-backup.tar.gz /data
```
- [ ] Verify `projects-backup.tar.gz` created
- [ ] Document backup schedule for your workflow
- [ ] (Optional) Set up automated backups via cron/launchd

### 13. Additional MCP Servers (if needed)
- [ ] Identify which MCP servers you need (besides tavily)
- [ ] Add installation commands to Dockerfile
- [ ] Enable in opencode config
- [ ] Rebuild: `docker compose build --no-cache`

## ☐ Troubleshooting Checklist

If something doesn't work, check:

- [ ] Docker Desktop is running
- [ ] `.env.container` exists and has real API keys (not placeholder values)
- [ ] Port 2222 isn't in use: `lsof -i :2222`
- [ ] SSH keys exist: `ls -la ~/.ssh/`
- [ ] Container is actually running: `docker compose ps`
- [ ] Check logs for errors: `docker compose logs`
- [ ] Enough disk space: `docker system df`

## ☐ Maintenance

### Regular Updates
- [ ] Update dotfiles in container: SSH in, `cd ~/Dotfiles && git pull`
- [ ] Rebuild image monthly for security updates: `docker compose build --pull`
- [ ] Update language versions in Dockerfile as needed
- [ ] Backup projects volume regularly

### When Things Go Wrong
- [ ] Stop container: `docker compose stop`
- [ ] Remove container: `docker compose down`
- [ ] Nuclear option (deletes ALL data): `docker compose down -v`
- [ ] Rebuild from scratch: `docker compose build --no-cache && docker compose up -d`

## 📝 Notes

- Container auto-updates dotfiles on each start (git pull)
- Named volumes persist between container removals
- Only `.env.container` is kept local (never committed)
- Context switching (home/work) requires container restart

---

**Stuck?** See [README.md](README.md) for detailed troubleshooting and FAQ.
