# 🎓 Docker Container - Technical Explanations

This document explains key technical decisions and intermediate Docker concepts used in this setup.

## Table of Contents
- [Why Build Opencode from Source?](#why-build-opencode-from-source)
- [Multi-Stage Builds](#multi-stage-builds)
- [Layer Caching Strategy](#layer-caching-strategy)
- [Named Volumes vs Bind Mounts](#named-volumes-vs-bind-mounts)
- [SSH in Containers](#ssh-in-containers)
- [Security Considerations](#security-considerations)

---

## Why Pin Opencode to a Specific Version?

### What is Opencode?

Opencode is a **Node.js application** (not Go!) published to npm as `opencode-ai`. It's installed via npm/npx.

### Current Approach: Pinned npm Version (RECOMMENDED)

```dockerfile
ENV OPENCODE_VERSION="1.1.40"
RUN npm install -g opencode-ai@${OPENCODE_VERSION}
```

**Pros:**
- ✅ **Reproducible** - same version every build
- ✅ Fast installation (pre-built package)
- ✅ Can test specific versions before updating
- ✅ Team members get identical environments
- ✅ Dockerfile serves as version documentation

**Cons:**
- ⚠️ Must manually update version number for new features
- ⚠️ Could miss important updates/security patches

### Alternative 1: Install Latest (Not Recommended)

```dockerfile
RUN npm install -g opencode-ai@latest
```

**Pros:**
- ✅ Always gets newest version
- ✅ Don't need to track version numbers

**Cons:**
- ❌ **Not reproducible** - builds differ over time
- ❌ Breaking changes can surprise you
- ❌ Hard to debug issues (which version had the problem?)
- ❌ Team members might have different versions

### Alternative 2: Homebrew Formula

```dockerfile
# Install Homebrew on Linux first, then:
RUN brew install opencode
```

**Pros:**
- ✅ Handles dependencies automatically
- ✅ Easy to update via brew

**Cons:**
- ⚠️ Adds Homebrew dependency (large)
- ⚠️ Slower installation
- ⚠️ Overkill for a single package

### Why We Chose Pinned Versions

**For container environments, reproducibility is key:**
- ✅ Same build today and in 6 months
- ✅ Easy to troubleshoot (know exact version)
- ✅ Intentional updates (you control when to upgrade)
- ✅ Can test new versions before committing

### How to Update

When a new Opencode version is released:

```dockerfile
# Change this line in Dockerfile:
ENV OPENCODE_VERSION="1.1.41"  # Update version number

# Then rebuild:
docker compose build --no-cache
docker compose up -d
```

---

## Multi-Stage Builds

### What Are They?

Multi-stage builds use multiple `FROM` statements in a Dockerfile. Each stage can copy artifacts from previous stages, but the final image only contains what's in the last stage.

### Example Pattern

```dockerfile
# Stage 1: Builder (large, with compilers)
FROM ubuntu:24.04 AS builder
RUN apt-get install build-essential
RUN gcc myapp.c -o myapp

# Stage 2: Runtime (small, minimal)
FROM ubuntu:24.04 AS runtime
COPY --from=builder /app/myapp /usr/local/bin/
CMD ["myapp"]
```

**Result:** Final image doesn't include gcc, build-essential, or source code!

### Why We Don't Use It (Yet)

Our current Dockerfile is **single-stage** because:
1. We need Python/Node/Go **at runtime** (not just build time)
2. This is a **development environment**, not a production app
3. You'll be writing and compiling code inside the container
4. Opencode itself needs Node.js to run (it's a Node app)

**When multi-stage makes sense:**
- Production apps that don't need dev tools
- Building static binaries for deployment
- Minimizing image size for cloud deployment

### Why Multi-Stage Doesn't Help Here

Even if we wanted to optimize, Opencode requires Node.js at runtime:

```dockerfile
# This wouldn't work - Opencode needs Node to run!
FROM ubuntu:24.04 AS builder
RUN install node
RUN npm install -g opencode-ai

FROM ubuntu:24.04 AS runtime
COPY --from=builder /usr/local/bin/opencode /usr/local/bin/
# ❌ Fails - opencode binary requires node runtime
```

**For a dev container, single-stage is the right choice.**

---

## Layer Caching Strategy

### How Docker Caching Works

Each Dockerfile instruction creates a **layer**. Docker caches layers and reuses them if:
1. The instruction hasn't changed
2. All previous layers match the cache

### Our Caching Strategy

```dockerfile
# 1. System packages (changes rarely) ← CACHED LONGEST
RUN apt-get update && apt-get install ...

# 2. Language runtimes (changes occasionally) ← CACHED MEDIUM
RUN install Python, Node, Go...

# 3. Development tools (changes sometimes) ← CACHED SHORT
RUN install neovim, starship, opencode...

# 4. Dotfiles (changes frequently) ← RARELY CACHED
RUN git clone Dotfiles
RUN stow configs
```

### Why Order Matters

**Bad ordering:**
```dockerfile
RUN git clone Dotfiles              # Changes daily
RUN apt-get install git vim zsh     # Never changes
```
Result: Every dotfiles update invalidates the cache, forcing reinstall of apt packages!

**Good ordering (ours):**
```dockerfile
RUN apt-get install git vim zsh     # Cached for weeks
RUN git clone Dotfiles              # Updates frequently, but doesn't affect above
```

Result: Apt packages stay cached, only dotfiles re-downloaded.

### Measuring Impact

```bash
# First build
docker compose build
# Time: ~15 minutes

# Change dotfiles, rebuild
docker compose build
# Time: ~30 seconds (everything cached until dotfiles layer)
```

---

## Named Volumes vs Bind Mounts

### Named Volumes (Docker-Managed)

```yaml
volumes:
  - projects:/home/dev/projects

volumes:
  projects:
    driver: local
```

**How it works:**
- Docker creates storage in `/var/lib/docker/volumes/`
- You reference it by name, not path
- Survives container deletion

**Use for:**
- ✅ Application data (your code projects)
- ✅ Database files
- ✅ Anything that should persist but doesn't need host access

**Pros:**
- Better performance (especially on macOS)
- Docker manages permissions automatically
- Easy to backup with `docker volume` commands
- Portable across different host systems

**Cons:**
- Not directly visible on host filesystem
- Can't edit with host tools
- Need special commands to inspect

### Bind Mounts (Host Filesystem)

```yaml
volumes:
  - ~/Obsidian:/home/dev/Obsidian
  - ~/.ssh:/home/dev/.ssh:ro
```

**How it works:**
- Direct mapping of host path to container path
- Changes in either place immediately visible in the other
- Real-time synchronization

**Use for:**
- ✅ Files you need to access from host (Obsidian)
- ✅ Configuration you want to edit on host
- ✅ SSH keys for authentication

**Pros:**
- Immediate sync with host filesystem
- Can edit with any host tool
- Easy to see what's mounted

**Cons:**
- UID/GID permission issues possible
- Slower on macOS (Docker runs in VM)
- Not portable (path must exist on host)

### Our Strategy

```yaml
volumes:
  # Single named volume for all development work
  - home:/home/dev
  
  # Bind mounts for host integration
  - ~/Obsidian:/home/dev/Obsidian        # Need Obsidian app on host (optional)
  - ~/.ssh:/home/dev/.ssh-host:ro        # Git authentication
```

**Why this combination?**
- Single `home` volume = simpler, all data in one place
- Includes projects, caches, configs - everything persists
- Named volume = fast performance (especially on macOS)
- Obsidian in bind mount = sync with desktop app
- SSH keys read-only = security

---

## SSH in Containers

### Why SSH Instead of `docker exec`?

Both can give you a shell, but SSH is better for development:

| Feature | `docker exec` | SSH |
|---------|---------------|-----|
| **Terminal emulation** | Basic | Full |
| **tmux support** | Sometimes breaks | Perfect |
| **Multiple sessions** | Works | Works better |
| **Port forwarding** | Manual `-p` flags | `ssh -L` dynamic |
| **Authentication** | None (direct access) | Key-based |
| **IDE integration** | Special extensions | Standard Remote-SSH |

### How It Works

1. **Container startup:**
```bash
# entrypoint.sh
ssh-keygen -A              # Generate host keys
/usr/sbin/sshd -D          # Start SSH daemon
```

2. **Your connection:**
```bash
ssh -p 2222 dev@localhost
# Uses your ~/.ssh/id_ed25519 key
```

3. **Authentication:**
- Your public key is copied into container
- SSH daemon verifies it
- No password needed

### Security Configuration

```dockerfile
# Dockerfile
RUN sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
RUN sed -i 's/#PubkeyAuthentication yes/PubkeyAuthentication yes/' /etc/ssh/sshd_config
RUN sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin no/' /etc/ssh/sshd_config
```

**What this means:**
- ❌ No password login (must use SSH key)
- ❌ No root login (must use `dev` user)
- ✅ Only your SSH key can authenticate

### Alternative: VS Code Dev Containers

If you prefer VS Code:

```json
// .devcontainer/devcontainer.json
{
  "dockerComposeFile": "../docker-compose.yml",
  "service": "opencode",
  "workspaceFolder": "/home/dev/projects"
}
```

This uses VS Code's built-in container connection instead of SSH.

---

## Security Considerations

### What's Safe vs Not Safe

#### ✅ Safe (Default Configuration)

```yaml
# Read-only SSH keys
volumes:
  - ~/.ssh:/home/dev/.ssh-host:ro
```
Container can read keys but not modify them.

```yaml
# No privileged mode
# privileged: false  (default)
```
Container can't access host kernel features.

```yaml
# Non-root user
USER dev
```
Processes run as regular user, not root.

#### ⚠️ Medium Risk (Not Enabled by Default)

```yaml
# Docker socket mounting (allows running docker commands)
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

**Risk:** Container can control host Docker daemon
- Could start privileged containers
- Could access other containers' data
- Effectively root on host

**When it's okay:**
- Personal machine, trusted code only
- You need to build/run containers from inside
- You understand the implications

#### ❌ High Risk (Never Do This)

```yaml
privileged: true
```
Container has full access to host kernel.

```yaml
volumes:
  - /:/host
```
Container can see entire host filesystem.

### AI Safety Considerations

**Your concern about API keys in environment:**

```yaml
env_file:
  - .env.container  # Contains ANTHROPIC_API_KEY, etc.
```

**Is this safe?** Yes, for your use case:
1. You're running AI code **you asked for**
2. Opencode needs the keys to function
3. The AI can't "steal" keys - it's using them for you
4. Container is isolated (no network exposure)

**It would be unsafe if:**
- You were running untrusted code from internet
- Container was publicly accessible
- Keys had access to billing/admin functions beyond API usage

**Best practice:** Use API keys with spending limits set at the provider level.

### Securing Further (Optional)

If you want additional hardening:

```yaml
security_opt:
  - no-new-privileges:true  # Can't escalate privileges
cap_drop:
  - ALL                     # Drop all Linux capabilities
cap_add:
  - NET_BIND_SERVICE        # Only add what's needed
read_only: true             # Filesystem read-only (needs tmpfs mounts)
```

**Trade-off:** More secure, but harder to use. Not recommended for development environments.

---

## Additional Resources

- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Dockerfile Reference](https://docs.docker.com/engine/reference/builder/)
- [Docker Security](https://docs.docker.com/engine/security/)
- [Docker Volumes Deep Dive](https://docs.docker.com/storage/volumes/)

---

**Questions?** Check [README.md](README.md) for troubleshooting or open an issue!
