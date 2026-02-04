# Docker Dev Container SSH Setup

## Summary

This container uses a **dedicated SSH key** (`dev_container_ed25519`) stored in a persistent Docker volume, rather than forwarding your host's SSH agent.

## Why This Approach?

### The Problem We Solved
- **1Password SSH agent** works great on the host
- **Docker Desktop for Mac** doesn't support Unix socket forwarding from macOS → Linux VM
- SSH agent socket forwarding is unreliable and complex

### The Solution
- Container generates its own SSH key on first run
- Key is stored in a Docker volume (`ssh-keys`)
- You add the public key to GitHub (one-time setup)
- All git operations in the container "just work"

## Security Considerations

✅ **This is secure because:**
- Key is stored only in a Docker volume on your local machine
- Key is purpose-specific (just for this dev container)
- You can revoke it anytime on GitHub
- It's isolated from your main account key (with 1Password)

⚠️ **Important notes:**
- The key has **no passphrase** (by design)
- It's equivalent to a passphrase-less key on a Linux workstation you own
- Name it clearly on GitHub: "Docker Dev Container"

## First-Time Setup

### 1. Start the container

```bash
cd ~/Dotfiles/docker
./scripts/start.sh
```

### 2. Watch the logs

```bash
docker compose logs -f
```

You'll see:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  ACTION REQUIRED: Add this public key to GitHub
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Go to: https://github.com/settings/ssh/new
2. Title: Docker Dev Container
3. Key:

ssh-ed25519 AAAA...your-key-here... docker-dev-container
```

### 3. Add key to GitHub

1. Copy the `ssh-ed25519` key from the logs
2. Go to https://github.com/settings/ssh/new
3. Title: "Docker Dev Container"
4. Paste the key
5. Click "Add SSH Key"

### 4. Continue setup

Press Enter in the container logs, and it will:
- Test the GitHub connection
- Clone your dotfiles
- Finish setup

## Daily Usage

After the first-time setup, everything just works:

```bash
# Inside container
git clone git@github.com:youruser/repo.git
cd repo
git commit -m "Changes"
git push  # No passphrase prompt!
```

## Managing the SSH Key

### View the public key

```bash
docker compose exec -u dev opencode cat ~/.ssh/dev_container_ed25519.pub
```

### Test GitHub connection

```bash
docker compose exec -u dev opencode ssh -T git@github.com
# Should see: "Hi username! You've successfully authenticated..."
```

### Regenerate the key

```bash
# Remove the old key
docker compose exec -u dev opencode rm ~/.ssh/dev_container_ed25519*

# Restart container (will generate new key)
docker compose restart

# Follow prompts to add new key to GitHub
```

### Revoke access

1. Go to https://github.com/settings/keys
2. Find "Docker Dev Container"
3. Click "Delete"

The container will no longer be able to push/pull from GitHub.

## Comparison: Host vs Container SSH Keys

| Aspect | Host Key (1Password) | Container Key (dev_container_ed25519) |
|--------|----------------------|--------------------------------------|
| **Storage** | 1Password | Docker volume |
| **Passphrase** | Yes (in 1Password) | No |
| **Authentication** | Touch ID / 1Password | Always available |
| **Scope** | All repos you access | Just this dev container |
| **Use case** | General development | Container-specific dev work |
| **Revocation** | Affects all machines | Just this container |

## Architecture

```
Host Machine (macOS)
├── ~/.ssh/id_ed25519 (1Password managed)
│   └── Used for: git operations on host
│
Docker Container
├── ~/.ssh/dev_container_ed25519 (volume-persisted)
│   └── Used for: git operations in container
│
Both keys registered on GitHub separately
```

## Troubleshooting

### "Permission denied (publickey)"

The key isn't on GitHub yet:

```bash
# Get the public key
docker compose exec -u dev opencode cat ~/.ssh/dev_container_ed25519.pub

# Add it to: https://github.com/settings/ssh/new
```

### "Host key verification failed"

GitHub's host key isn't trusted:

```bash
docker compose exec -u dev opencode ssh-keyscan github.com >> ~/.ssh/known_hosts
```

### Key got deleted somehow

If you deleted the Docker volume:

```bash
# Recreate the volume
docker compose down -v
docker compose up -d

# Follow first-time setup again
```

## References

- [GitHub SSH Key Documentation](https://docs.github.com/en/authentication/connecting-to-github-with-ssh)
- [Docker Volumes](https://docs.docker.com/storage/volumes/)
- [SSH Config File](https://man.openbsd.org/ssh_config)
