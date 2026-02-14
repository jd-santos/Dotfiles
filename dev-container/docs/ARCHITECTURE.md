# Architecture: Three-Container AI Development Environment

> A defense-in-depth approach to AI-assisted development with varying trust levels

## Table of Contents

- [Executive Summary](#executive-summary)
- [The Three Environments](#the-three-environments)
- [Security Model](#security-model)
- [Architecture Diagrams](#architecture-diagrams)
- [Technology Choices](#technology-choices)
- [Container Image Strategy](#container-image-strategy)
- [Data Persistence](#data-persistence)
- [Networking](#networking)
- [Integration Points](#integration-points)
- [Future Considerations](#future-considerations)

---

## Executive Summary

This architecture defines three containerized AI development environments, each tailored for a specific use case and trust level:

| Environment | Purpose | Trust Level | Location |
|-------------|---------|-------------|----------|
| **Dev Container** | Full hands-on development | Full | Portable (laptops, VMs) |
| **Openclaw Agent** | AI agent via messaging apps | Restricted | Mac Mini (home server) |
| **Opencode Web** | Browser-based AI coding | Moderate | Mac Mini (home server) |

### Why This Architecture Exists

1. **Different interaction modes need different permissions** - A human at a terminal needs full access; an AI responding to WhatsApp messages does not.

2. **Defense in depth** - Multiple security layers ensure that compromise of one layer doesn't grant unlimited access.

3. **Portability without compromise** - The same container image runs everywhere, with policies determining capabilities.

4. **Auditability** - All AI actions can be logged, reviewed, and controlled through centralized policies.

### Key Benefits

- **Single image, multiple personas** - One Dockerfile to maintain
- **Granular control** - Cedar policies define exactly what each environment can do
- **Branch protection** - AI agents can propose changes but cannot deploy them
- **Reproducibility** - Identical environments across all devices
- **Isolation** - Container boundaries prevent host system compromise

---

## The Three Environments

### Environment 1: Dev Container (Full Access)

```
┌─────────────────────────────────────────────────────────────┐
│                    DEV CONTAINER                             │
│                   Trust Level: FULL                          │
├─────────────────────────────────────────────────────────────┤
│  User: Human developer with terminal access                  │
│  Interface: SSH (port 2222)                                  │
│  Tools: tmux, neovim, opencode, git, all CLI tools          │
│  SSH Key: Account-level (full push to any branch)           │
│  Location: Laptops, cloud VMs, any Docker host              │
└─────────────────────────────────────────────────────────────┘
```

**Purpose**: Full hands-on development environment for human developers.

**Characteristics**:

| Attribute | Value |
|-----------|-------|
| Trust Level | Full |
| SSH Key Type | Account-level (added to GitHub user settings) |
| Push Permissions | All branches including `main` |
| Network Access | Unrestricted |
| File Access | Full read/write to workspace |
| Process Execution | Unrestricted |

**Typical Workflow**:
```bash
# Connect from laptop
ssh -p 2222 dev@localhost

# Or from remote (when on VPN/Tailscale)
ssh -p 2222 dev@macmini.tailnet

# Full development workflow
cd ~/projects/myapp
nvim src/main.ts
opencode  # AI assistant with full permissions
git push origin main  # Direct push allowed
```

**When to Use**:
- Active development sessions
- Code review and refactoring
- Deploying to production
- Any task requiring human judgment and full access

---

### Environment 2: Openclaw Agent Container (Restricted)

```
┌─────────────────────────────────────────────────────────────┐
│                  OPENCLAW AGENT CONTAINER                    │
│                  Trust Level: RESTRICTED                     │
├─────────────────────────────────────────────────────────────┤
│  User: AI agent receiving messages from WhatsApp/Telegram   │
│  Interface: Openclaw Gateway (port 18789)                   │
│  Tools: Limited CLI tools, git (branch-only), opencode      │
│  SSH Key: Deploy key (cannot push to main/master)           │
│  Location: Mac Mini home server only                        │
│  Policy: Leash + Cedar (fine-grained restrictions)          │
└─────────────────────────────────────────────────────────────┘
```

**Purpose**: AI agent that operates autonomously via messaging platforms.

**Characteristics**:

| Attribute | Value |
|-----------|-------|
| Trust Level | Restricted (Leash + Cedar policies) |
| SSH Key Type | Deploy key (per-repository) |
| Push Permissions | Feature branches only (`feature/*`, `fix/*`, `ai/*`) |
| Network Access | Allowlisted hosts only |
| File Access | Workspace only, no system files |
| Process Execution | Allowlisted binaries only |

**How It Works**:
```
WhatsApp/Telegram ──▶ Openclaw Gateway ──▶ Leash Proxy ──▶ Container
                      (port 18789)         (policy check)   (restricted shell)
```

**Example Interaction**:
```
User (WhatsApp): "Add input validation to the login form"

Agent Actions (all policy-checked):
1. git checkout -b ai/add-login-validation  ✓ Allowed
2. Read src/components/LoginForm.svelte     ✓ Allowed (workspace)
3. Edit LoginForm.svelte                    ✓ Allowed (workspace)
4. git commit -m "Add input validation"     ✓ Allowed
5. git push origin ai/add-login-validation  ✓ Allowed (feature branch)
6. gh pr create                             ✓ Allowed

Blocked Actions:
- git push origin main                      ✗ Denied (branch protection)
- rm -rf /                                  ✗ Denied (path restriction)
- curl malicious-site.com                   ✗ Denied (network allowlist)
- sudo anything                             ✗ Denied (no sudo)
```

**When to Use**:
- Async tasks requested via mobile
- Automated code improvements
- Issue triage and initial implementation
- Any task where human review is required before merge

---

### Environment 3: Opencode Web Container (Moderate)

```
┌─────────────────────────────────────────────────────────────┐
│                  OPENCODE WEB CONTAINER                      │
│                  Trust Level: MODERATE                       │
├─────────────────────────────────────────────────────────────┤
│  User: Human developer via web browser                       │
│  Interface: Opencode Web UI (port 4096)                     │
│  Tools: Opencode web server, git, common dev tools          │
│  SSH Key: Deploy key (cannot push to main/master)           │
│  Location: Mac Mini home server only                        │
│  Policy: Leash + Cedar (moderate restrictions)              │
└─────────────────────────────────────────────────────────────┘
```

**Purpose**: Browser-based AI coding for lighter-touch development.

**Characteristics**:

| Attribute | Value |
|-----------|-------|
| Trust Level | Moderate (Leash + Cedar policies) |
| SSH Key Type | Deploy key (per-repository) |
| Push Permissions | Feature branches only |
| Network Access | Development-related hosts |
| File Access | Workspace with some restrictions |
| Process Execution | Common dev tools only |

**Typical Workflow**:
```
Browser ──▶ https://opencode.local:4096 ──▶ Leash Proxy ──▶ Container
                                            (policy check)   (web server)
```

**When to Use**:
- Quick edits from any device with a browser
- Code review with AI assistance
- Learning and experimentation
- When full terminal access isn't needed

---

## Security Model

### Layered Defense Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SECURITY LAYERS                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Layer 4: GitHub Branch Protection                                   │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  - main/master branches require PR + approval                │    │
│  │  - Deploy keys cannot push to protected branches             │    │
│  │  - Enforced server-side (cannot be bypassed by client)       │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│  Layer 3: SSH Deploy Keys                                            │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  - Per-container keys with limited repository access         │    │
│  │  - Account key (full) vs Deploy key (restricted)             │    │
│  │  - Revocable without affecting other systems                 │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│  Layer 2: Leash + Cedar Policies                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  - File access (read/write/execute by path)                  │    │
│  │  - Process execution (binary allowlists)                     │    │
│  │  - Network connections (host/port allowlists)                │    │
│  │  - MCP tool calls (which tools, which parameters)            │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│  Layer 1: Container Isolation                                        │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  - Process namespace isolation                               │    │
│  │  - Filesystem isolation (only mounted volumes visible)       │    │
│  │  - Network namespace (controlled port exposure)              │    │
│  │  - Resource limits (CPU, memory, disk)                       │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### What Each Layer Protects Against

| Threat | Container | Leash/Cedar | Deploy Keys | Branch Protection |
|--------|-----------|-------------|-------------|-------------------|
| Host filesystem access | **Yes** | Partial | No | No |
| Arbitrary process execution | Partial | **Yes** | No | No |
| Network exfiltration | No | **Yes** | No | No |
| Unauthorized repo access | No | No | **Yes** | No |
| Direct push to production | No | No | Partial | **Yes** |
| Credential theft (in-container) | No | Partial | No | No |
| Resource exhaustion | **Yes** | No | No | No |
| Escape to host | **Yes** | No | No | No |

### Trust Level Comparison

| Capability | Dev Container | Openclaw Agent | Opencode Web |
|------------|---------------|----------------|--------------|
| Push to main | Yes | No | No |
| Push to feature branches | Yes | Yes | Yes |
| Read any file | Yes | Workspace only | Workspace only |
| Write any file | Yes | Workspace only | Workspace only |
| Run any binary | Yes | Allowlist only | Common tools |
| Network access | Unrestricted | Allowlist only | Dev-related |
| Install packages | Yes | No | Limited |
| Sudo access | Yes | No | No |

---

## Architecture Diagrams

### High-Level Architecture

```
                                    INTERNET
                                        │
                                        ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                              MAC MINI (Home Server)                        │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                           LEASH DAEMON                                │ │
│  │                    (Policy Enforcement & Monitoring)                  │ │
│  └────────────┬─────────────────────┬─────────────────────┬─────────────┘ │
│               │                     │                     │               │
│               ▼                     ▼                     ▼               │
│  ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐    │
│  │  OPENCLAW AGENT    │ │   OPENCODE WEB     │ │   DEV CONTAINER    │    │
│  │    CONTAINER       │ │    CONTAINER       │ │    (if local)      │    │
│  │                    │ │                    │ │                    │    │
│  │  Trust: RESTRICTED │ │  Trust: MODERATE   │ │  Trust: FULL       │    │
│  │  Port: 18789       │ │  Port: 4096        │ │  Port: 2222        │    │
│  │  Key: Deploy       │ │  Key: Deploy       │ │  Key: Account      │    │
│  └────────────────────┘ └────────────────────┘ └────────────────────┘    │
│               │                     │                     │               │
│               └──────────────┬──────┴─────────────────────┘               │
│                              │                                            │
│                              ▼                                            │
│                    ┌──────────────────┐                                  │
│                    │  SHARED VOLUMES  │                                  │
│                    │  - workspace     │                                  │
│                    │  - ssh-keys      │                                  │
│                    │  - dotfiles      │                                  │
│                    └──────────────────┘                                  │
│                                                                            │
└───────────────────────────────────────────────────────────────────────────┘
         │                                                      ▲
         │                                                      │
         ▼                                                      │
┌─────────────────────┐                              ┌─────────────────────┐
│   MESSAGING APPS    │                              │   REMOTE DEVICES    │
│                     │                              │                     │
│  - WhatsApp         │                              │  - Laptop (SSH)     │
│  - Telegram         │                              │  - Tablet (Web)     │
│  - Slack            │                              │  - Phone (Messages) │
└─────────────────────┘                              └─────────────────────┘
```

### Permission Flow: Git Push Request

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    GIT PUSH REQUEST FLOW                                 │
└─────────────────────────────────────────────────────────────────────────┘

  AI Agent                Leash                Container              GitHub
     │                      │                     │                      │
     │  git push main       │                     │                      │
     │─────────────────────▶│                     │                      │
     │                      │                     │                      │
     │                      │ Check Cedar policy  │                      │
     │                      │ (push to main?)     │                      │
     │                      │                     │                      │
     │   DENIED             │                     │                      │
     │◀─────────────────────│                     │                      │
     │   (policy violation) │                     │                      │
     │                      │                     │                      │
     │  git push ai/feature │                     │                      │
     │─────────────────────▶│                     │                      │
     │                      │                     │                      │
     │                      │ Check Cedar policy  │                      │
     │                      │ (push to ai/*?)     │                      │
     │                      │                     │                      │
     │                      │ ALLOWED             │                      │
     │                      │────────────────────▶│                      │
     │                      │                     │                      │
     │                      │                     │  SSH with deploy key │
     │                      │                     │─────────────────────▶│
     │                      │                     │                      │
     │                      │                     │                      │ Check deploy key
     │                      │                     │                      │ permissions
     │                      │                     │                      │
     │                      │                     │        SUCCESS       │
     │                      │                     │◀─────────────────────│
     │                      │                     │                      │
     │       SUCCESS        │                     │                      │
     │◀─────────────────────│◀────────────────────│                      │
     │                      │                     │                      │
```

### Network Topology

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         NETWORK TOPOLOGY                                 │
└─────────────────────────────────────────────────────────────────────────┘

                         ┌─────────────────┐
                         │    INTERNET     │
                         └────────┬────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │       HOME ROUTER         │
                    │    (NAT / Port Forward)   │
                    └─────────────┬─────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
              ▼                   ▼                   ▼
    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
    │   Tailscale     │ │   Cloudflare    │ │   Direct Port   │
    │   (Preferred)   │ │   Tunnel        │ │   Forward       │
    │                 │ │   (Optional)    │ │   (Optional)    │
    └────────┬────────┘ └────────┬────────┘ └────────┬────────┘
             │                   │                   │
             └───────────────────┼───────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │       MAC MINI          │
                    │     192.168.1.x         │
                    └─────────────┬───────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
        ▼                         ▼                         ▼
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│ :2222 (SSH)   │       │ :18789        │       │ :4096         │
│               │       │ (Openclaw)    │       │ (Web UI)      │
│ Dev Container │       │               │       │               │
│               │       │ Agent         │       │ Opencode Web  │
│ ┌───────────┐ │       │ Container     │       │ Container     │
│ │   sshd    │ │       │               │       │               │
│ └───────────┘ │       │ ┌───────────┐ │       │ ┌───────────┐ │
└───────────────┘       │ │  Gateway  │ │       │ │ Web Server│ │
                        │ └───────────┘ │       │ └───────────┘ │
                        └───────────────┘       └───────────────┘


Port Assignments:
─────────────────
  2222  - SSH access to Dev Container
  4096  - Opencode Web UI (HTTPS)
 18789  - Openclaw Gateway (messaging integration)
 18080  - Leash monitoring dashboard (internal)
```

### Leash Proxy Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      LEASH PROXY ARCHITECTURE                            │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                              LEASH DAEMON                                 │
│                                                                          │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐         │
│  │ Cedar Policy   │    │   Audit Log    │    │   Metrics      │         │
│  │ Engine         │    │                │    │   Collector    │         │
│  └───────┬────────┘    └───────┬────────┘    └───────┬────────┘         │
│          │                     │                     │                   │
│          └─────────────────────┼─────────────────────┘                   │
│                                │                                         │
│                                ▼                                         │
│                    ┌─────────────────────┐                              │
│                    │    Request Router   │                              │
│                    └──────────┬──────────┘                              │
│                               │                                          │
│         ┌─────────────────────┼─────────────────────┐                   │
│         │                     │                     │                   │
│         ▼                     ▼                     ▼                   │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐             │
│  │   File      │      │   Process   │      │   Network   │             │
│  │   Proxy     │      │   Proxy     │      │   Proxy     │             │
│  │             │      │             │      │             │             │
│  │ - open()    │      │ - exec()    │      │ - connect() │             │
│  │ - read()    │      │ - fork()    │      │ - bind()    │             │
│  │ - write()   │      │ - spawn()   │      │ - sendto()  │             │
│  └──────┬──────┘      └──────┬──────┘      └──────┬──────┘             │
│         │                    │                    │                     │
└─────────┼────────────────────┼────────────────────┼─────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
    ┌──────────────────────────────────────────────────┐
    │                   CONTAINER                       │
    │                                                   │
    │   Application ──▶ Syscall ──▶ Leash ──▶ Kernel   │
    │                                                   │
    └──────────────────────────────────────────────────┘
```

---

## Technology Choices

### Base Image: Fedora 43

**Why Fedora over alternatives:**

| Aspect | Fedora 43 | Ubuntu LTS | Debian | Alpine |
|--------|-----------|------------|--------|--------|
| Package freshness | Excellent | Good | Moderate | Good |
| systemd support | Native | Native | Native | No |
| SELinux/security | Built-in | AppArmor | Optional | Minimal |
| Container tooling | Excellent | Good | Good | Good |
| Developer experience | Excellent | Excellent | Good | Moderate |
| Image size | ~400MB | ~300MB | ~250MB | ~50MB |
| glibc compatibility | Full | Full | Full | musl (issues) |

**Key reasons for Fedora:**
- Modern packages without PPAs or backports
- Native Podman/Docker tooling
- SELinux policies available if needed
- Consistent with Red Hat enterprise patterns
- Active security update cadence

### Policy Enforcement: Leash + Cedar

**Leash** provides:
- System call interception without kernel modules
- Container-aware policy enforcement
- Real-time audit logging
- Low-latency decision making

**Cedar** (by AWS) provides:
- Human-readable policy language
- Formal verification of policies
- Attribute-based access control
- Composable policy sets

**Example Cedar Policy:**

```cedar
// Allow AI agent to read files in workspace
permit (
    principal == Agent::"openclaw",
    action == Action::"read",
    resource
)
when {
    resource.path.startsWith("/home/dev/projects/")
};

// Allow AI agent to push to feature branches only
permit (
    principal == Agent::"openclaw",
    action == Action::"git-push",
    resource
)
when {
    resource.branch.startsWith("ai/") ||
    resource.branch.startsWith("feature/") ||
    resource.branch.startsWith("fix/")
};

// Deny push to protected branches
forbid (
    principal == Agent::"openclaw",
    action == Action::"git-push",
    resource
)
when {
    resource.branch == "main" ||
    resource.branch == "master" ||
    resource.branch.startsWith("release/")
};
```

### SSH Keys: Deploy Keys vs Alternatives

| Method | Scope | Revocation | Audit | Setup Complexity |
|--------|-------|------------|-------|------------------|
| **Deploy Keys** | Per-repo | Easy | GitHub logs | Simple |
| Personal Access Tokens | Per-user | Easy | Limited | Simple |
| GitHub Apps | Org-wide | Moderate | Excellent | Complex |
| SSH Certificate Authority | Org-wide | Excellent | Excellent | Very Complex |

**Why Deploy Keys:**
- Scoped to specific repositories
- Cannot access other repos if compromised
- Easy to rotate per-container
- Native GitHub support
- No token expiration management

### Why Openclaw's Internal Sandbox is Disabled

Openclaw includes its own sandboxing mechanism, but we disable it:

```yaml
# openclaw config
sandbox: "off"
```

**Rationale:**

1. **The container IS the sandbox** - Docker provides stronger isolation than process-level sandboxing

2. **Leash provides finer control** - Cedar policies are more expressive than Openclaw's built-in rules

3. **Avoid double-sandboxing overhead** - Two sandboxes don't stack well and create compatibility issues

4. **Unified policy management** - All three containers use the same Leash/Cedar infrastructure

5. **Better debugging** - One sandbox layer is easier to troubleshoot than nested sandboxes

---

## Container Image Strategy

### Single Image, Multiple Personas

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CONTAINER IMAGE STRATEGY                          │
└─────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────────┐
                    │                         │
                    │    Dockerfile           │
                    │    (Single Source)      │
                    │                         │
                    └───────────┬─────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │                         │
                    │  opencode-dev:latest    │
                    │  (Single Image)         │
                    │                         │
                    │  Contents:              │
                    │  - Fedora 43 base       │
                    │  - Python/Node/Go       │
                    │  - neovim, tmux         │
                    │  - opencode, openclaw   │
                    │  - git, ssh, dev tools  │
                    │                         │
                    └───────────┬─────────────┘
                                │
            ┌───────────────────┼───────────────────┐
            │                   │                   │
            ▼                   ▼                   ▼
    ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
    │ Dev Container │   │ Openclaw      │   │ Opencode Web  │
    │               │   │ Agent         │   │               │
    │ ENTRYPOINT:   │   │               │   │ ENTRYPOINT:   │
    │ sshd          │   │ ENTRYPOINT:   │   │ opencode-web  │
    │               │   │ openclaw      │   │               │
    │ Cedar Policy: │   │               │   │ Cedar Policy: │
    │ full-access   │   │ Cedar Policy: │   │ moderate      │
    │               │   │ restricted    │   │               │
    │ SSH Key:      │   │               │   │ SSH Key:      │
    │ account       │   │ SSH Key:      │   │ deploy        │
    │               │   │ deploy        │   │               │
    └───────────────┘   └───────────────┘   └───────────────┘
```

**Benefits of Single Image:**

1. **Consistency** - Identical base environment across all use cases
2. **Smaller footprint** - One image to store, not three
3. **Simpler CI/CD** - One build pipeline
4. **Easier updates** - Patch once, deploy everywhere
5. **Reduced drift** - No "works in dev but not in agent" issues

**How Differentiation Works:**

```yaml
# docker-compose.yml (simplified)

services:
  dev:
    image: opencode-dev:latest
    entrypoint: ["/usr/sbin/sshd", "-D"]
    volumes:
      - account-ssh-key:/home/dev/.ssh
      - full-access-policy:/etc/leash/policies
    ports:
      - "2222:22"

  openclaw-agent:
    image: opencode-dev:latest
    entrypoint: ["leash", "wrap", "--policy=restricted", "openclaw"]
    volumes:
      - deploy-ssh-key:/home/dev/.ssh
      - restricted-policy:/etc/leash/policies
    ports:
      - "18789:18789"

  opencode-web:
    image: opencode-dev:latest
    entrypoint: ["leash", "wrap", "--policy=moderate", "opencode-web"]
    volumes:
      - deploy-ssh-key-web:/home/dev/.ssh
      - moderate-policy:/etc/leash/policies
    ports:
      - "4096:4096"
```

---

## Data Persistence

### Volume Strategy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         VOLUME ARCHITECTURE                              │
└─────────────────────────────────────────────────────────────────────────┘

NAMED VOLUMES (Docker-managed, survive container recreation)
─────────────────────────────────────────────────────────────

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ dev-workspace   │     │ agent-workspace │     │ web-workspace   │
│                 │     │                 │     │                 │
│ /home/dev/      │     │ /home/dev/      │     │ /home/dev/      │
│   projects/     │     │   projects/     │     │   projects/     │
│   .cache/       │     │   .cache/       │     │   .cache/       │
│   .local/       │     │   .local/       │     │   .local/       │
└─────────────────┘     └─────────────────┘     └─────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ dev-ssh-keys    │     │ agent-ssh-keys  │     │ web-ssh-keys    │
│                 │     │                 │     │                 │
│ Account key     │     │ Deploy key      │     │ Deploy key      │
│ (full access)   │     │ (repo-specific) │     │ (repo-specific) │
└─────────────────┘     └─────────────────┘     └─────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                       shared-dotfiles                            │
│                                                                  │
│  /home/dev/Dotfiles (cloned from GitHub, read-mostly)           │
│  - Shared across all containers                                  │
│  - Updated via git pull                                          │
└─────────────────────────────────────────────────────────────────┘


BIND MOUNTS (Direct host filesystem access)
───────────────────────────────────────────

┌─────────────────────────────────────────────────────────────────┐
│  ~/.env ──────────────▶ /home/dev/.env (read-only)              │
│                                                                  │
│  API keys stored on host, mounted read-only into containers     │
│  - ANTHROPIC_API_KEY                                            │
│  - OPENROUTER_API_KEY                                           │
│  - TAVILY_API_KEY                                               │
│  - etc.                                                          │
└─────────────────────────────────────────────────────────────────┘
```

### What Survives What

| Event | Workspace | SSH Keys | Dotfiles | API Keys |
|-------|-----------|----------|----------|----------|
| Container restart | Yes | Yes | Yes | Yes (host) |
| Container recreation | Yes | Yes | Yes | Yes (host) |
| `docker compose down` | Yes | Yes | Yes | Yes (host) |
| `docker compose down -v` | **No** | **No** | **No** | Yes (host) |
| Host reboot | Yes | Yes | Yes | Yes |
| Volume backup/restore | Yes | Yes | Yes | N/A |

### Backup Strategy

```bash
# Backup all named volumes
for vol in dev-workspace agent-workspace web-workspace dev-ssh-keys; do
    docker run --rm \
        -v ${vol}:/data:ro \
        -v $(pwd)/backups:/backup \
        alpine tar czf /backup/${vol}-$(date +%Y%m%d).tar.gz -C /data .
done

# Restore a volume
docker run --rm \
    -v dev-workspace:/data \
    -v $(pwd)/backups:/backup \
    alpine tar xzf /backup/dev-workspace-20240115.tar.gz -C /data
```

---

## Networking

### Port Assignment Table

| Port | Service | Container | Protocol | Exposure |
|------|---------|-----------|----------|----------|
| 2222 | SSH | Dev Container | TCP | Host + Tailscale |
| 4096 | Opencode Web UI | Opencode Web | HTTPS | Host + Tailscale |
| 18789 | Openclaw Gateway | Openclaw Agent | HTTPS | Host + Tailscale |
| 18080 | Leash Dashboard | Host | HTTP | Localhost only |

### Remote Access Options

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       REMOTE ACCESS OPTIONS                              │
└─────────────────────────────────────────────────────────────────────────┘

Option 1: Tailscale (Recommended)
─────────────────────────────────
  Laptop ──▶ Tailscale Network ──▶ Mac Mini
  
  Pros: Zero config, encrypted, works behind NAT
  Cons: Requires Tailscale account
  
  Access: ssh dev@macmini.tailnet -p 2222


Option 2: Cloudflare Tunnel
───────────────────────────
  Browser ──▶ Cloudflare ──▶ cloudflared ──▶ Mac Mini
  
  Pros: No port forwarding, DDoS protection
  Cons: Web only (no raw SSH), Cloudflare dependency
  
  Access: https://opencode.mydomain.com


Option 3: WireGuard VPN
───────────────────────
  Laptop ──▶ WireGuard ──▶ Home Network ──▶ Mac Mini
  
  Pros: Fast, self-hosted, no third party
  Cons: Manual setup, port forwarding needed
  
  Access: ssh dev@10.0.0.5 -p 2222


Option 4: SSH Jump Host
───────────────────────
  Laptop ──▶ VPS (jump) ──▶ Reverse SSH ──▶ Mac Mini
  
  Pros: Works anywhere, no home router config
  Cons: Requires VPS, latency
  
  Access: ssh -J jump@vps.example.com dev@localhost -p 2222
```

### Leash Network Policy Enforcement

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    NETWORK POLICY FLOW                                   │
└─────────────────────────────────────────────────────────────────────────┘

    Container Process                 Leash Proxy                  Internet
           │                              │                            │
           │  connect(github.com:22)      │                            │
           │─────────────────────────────▶│                            │
           │                              │                            │
           │                              │  Check policy:             │
           │                              │  Is github.com allowed?    │
           │                              │  Is port 22 allowed?       │
           │                              │                            │
           │                              │         ALLOWED            │
           │                              │───────────────────────────▶│
           │                              │                            │
           │         SUCCESS              │◀───────────────────────────│
           │◀─────────────────────────────│                            │
           │                              │                            │
           │  connect(evil.com:443)       │                            │
           │─────────────────────────────▶│                            │
           │                              │                            │
           │                              │  Check policy:             │
           │                              │  Is evil.com allowed?      │
           │                              │                            │
           │         DENIED               │  NO - not in allowlist     │
           │◀─────────────────────────────│                            │
           │    (EACCES)                  │                            │


Network Allowlist (Openclaw Agent):
───────────────────────────────────
  - github.com:22,443         (Git operations)
  - api.anthropic.com:443     (Claude API)
  - api.openai.com:443        (OpenAI API, if used)
  - api.tavily.com:443        (Search MCP)
  - registry.npmjs.org:443    (Package installs)
  - pypi.org:443              (Package installs)
```

---

## Integration Points

### System Integration Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      INTEGRATION ARCHITECTURE                            │
└─────────────────────────────────────────────────────────────────────────┘

                           ┌─────────────────┐
                           │    GitHub       │
                           │                 │
                           │  - Repos        │
                           │  - Actions      │
                           │  - PRs          │
                           └────────┬────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
            ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
            │ Dev         │ │ Agent       │ │ Web         │
            │ Container   │ │ Container   │ │ Container   │
            │             │ │             │ │             │
            │ git push    │ │ git push    │ │ git push    │
            │ (account)   │ │ (deploy)    │ │ (deploy)    │
            └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
                   │               │               │
                   └───────────────┼───────────────┘
                                   │
                                   ▼
                           ┌─────────────────┐
                           │  Shared         │
                           │  Dotfiles       │
                           │                 │
                           │  - .zshrc       │
                           │  - .gitconfig   │
                           │  - nvim config  │
                           │  - opencode cfg │
                           └─────────────────┘


┌─────────────────────────────────────────────────────────────────────────┐
│                    MESSAGING INTEGRATION                                 │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────────────────────┐
│  WhatsApp    │     │   Telegram   │     │         Slack                │
│              │     │              │     │                              │
│  User sends  │     │  User sends  │     │  User sends message          │
│  message     │     │  message     │     │  in #ai-dev channel          │
└──────┬───────┘     └──────┬───────┘     └──────────────┬───────────────┘
       │                    │                            │
       └────────────────────┼────────────────────────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │   Openclaw Gateway    │
                │   (port 18789)        │
                │                       │
                │   - Webhook receiver  │
                │   - Message parser    │
                │   - Response sender   │
                └───────────┬───────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │   Leash Policy Check  │
                │                       │
                │   - Validate action   │
                │   - Check permissions │
                │   - Audit log         │
                └───────────┬───────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │   Opencode Engine     │
                │                       │
                │   - Process request   │
                │   - Execute tools     │
                │   - Generate response │
                └───────────────────────┘
```

### Dotfiles Sharing

All three containers share the same dotfiles configuration:

```
~/Dotfiles/
├── git/          → .gitconfig (shared identity)
├── zsh/          → .zshrc (shell config)
├── nvim/         → neovim config
├── tmux/         → tmux config
├── starship/     → prompt config
├── opencode-core/→ base opencode config (shared)
├── opencode-home/→ home context overrides
└── opencode-work/→ work context overrides
```

**Stow deployment** (in container):
```bash
cd ~/Dotfiles
stow git zsh nvim tmux starship opencode-core opencode-home
```

This ensures consistent tooling and configuration across all environments while allowing context-specific overrides.

---

## Future Considerations

### Planned Enhancements

#### 1. Full Leash Integration

**Status**: Not yet implemented

**Plan**:
- Deploy Leash daemon on Mac Mini
- Create Cedar policies for each container type
- Integrate audit logging with monitoring stack
- Build policy management UI

#### 2. VPS Portability

**Status**: Designed, not deployed

**Goal**: Run the same containers on cloud VPS for:
- Lower latency from different locations
- Redundancy if home server is offline
- Burst capacity for heavy workloads

**Approach**:
```
┌─────────────────┐     ┌─────────────────┐
│   Mac Mini      │     │   Cloud VPS     │
│   (Primary)     │     │   (Secondary)   │
│                 │◀───▶│                 │
│   Full stack    │sync │   Agent only    │
└─────────────────┘     └─────────────────┘
```

#### 3. Additional Openclaw Agents

**Potential agents**:
- Code review agent (triggered on PR)
- Documentation agent (keeps docs in sync)
- Dependency update agent (automated PRs)
- Test coverage agent (suggests tests)

#### 4. CI/CD Integration

**Goal**: Containers participate in GitHub Actions workflows

```yaml
# .github/workflows/ai-assist.yml
on:
  issues:
    types: [labeled]

jobs:
  ai-implement:
    if: contains(github.event.label.name, 'ai-implement')
    runs-on: self-hosted  # Mac Mini runner
    container: opencode-dev:latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          opencode "Implement the feature described in issue #${{ github.event.issue.number }}"
          git push origin ai/issue-${{ github.event.issue.number }}
          gh pr create --fill
```

#### 5. Monitoring and Observability

**Planned stack**:
- Prometheus for metrics
- Grafana for dashboards
- Loki for log aggregation
- Alertmanager for notifications

**Key metrics**:
- Policy violations per container
- API token usage
- Git operations per agent
- Response latency

### Migration Path

```
Current State                    Future State
─────────────────────────────────────────────────────────

Single container          ──▶    Three containers
No policy enforcement     ──▶    Leash + Cedar
Account SSH key only      ──▶    Account + Deploy keys
Local only               ──▶    Local + VPS
Manual monitoring        ──▶    Prometheus/Grafana
```

---

## References

- [Docker Security Best Practices](https://docs.docker.com/develop/security-best-practices/)
- [Cedar Policy Language](https://www.cedarpolicy.com/)
- [GitHub Deploy Keys](https://docs.github.com/en/developers/overview/managing-deploy-keys)
- [Leash Documentation](https://github.com/anthropics/leash) *(when available)*
- [Tailscale Documentation](https://tailscale.com/kb/)

---

*Last updated: 2024-01*
