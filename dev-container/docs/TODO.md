# Three-Container Architecture Implementation Guide

A step-by-step implementation guide for building a secure, multi-container development environment with differentiated permission models.

---

## Overview

### What We're Building

Three Docker containers with different security profiles:

| Container | Purpose | Repository Access | Branch Access |
|-----------|---------|-------------------|---------------|
| **dev-full** | Personal development | All repos (account key) | All branches including main |
| **openclaw-agent** | AI coding agent (CLI) | Dotfiles only (deploy key) | Feature branches only (not main) |
| **opencode-web** | Web-based AI assistant | Dotfiles only (deploy key) | Feature branches only (not main) |

### Security Architecture

```
                    GitHub Account
                          |
        +-----------------+-----------------+
        |                                   |
   Account SSH Key                    Deploy Keys
   (full access)                    (repo-specific)
        |                                   |
   dev-full                    +------------+------------+
   container                   |                         |
                        openclaw-agent           opencode-web
                          container                container
                               |                         |
                        Branch Protection Rules
                        (prohibit direct main push)
```

### Prerequisites

Before starting, ensure you have:

- [ ] **Docker Desktop** installed and running
- [ ] **GitHub account** with repository access
- [ ] **GitHub CLI (`gh`)** installed (optional, for easier key management)
- [ ] **~2 hours** for initial setup (Phase 1-4)
- [ ] **API keys** for AI services (Anthropic, etc.)

### Estimated Time by Phase

| Phase | Description | Time |
|-------|-------------|------|
| 1 | Modernize Base Container | 45-60 min |
| 2 | SSH Key Architecture | 30-45 min |
| 3 | Cedar Policies | 20-30 min |
| 4 | Docker Compose for Mac Mini | 30-45 min |
| 5 | Leash Integration | 30-45 min (when ready) |
| 6 | Remote Access | 20-30 min (future) |

---

## Phase 1: Modernize Base Container

**Goal:** Convert from Ubuntu 24.04 to Fedora for better tooling and package freshness.

### Prerequisites for This Phase

- Docker Desktop running
- Existing `Dockerfile` to reference
- Internet connection for package downloads

### 1.1 Research and Verify Fedora Package Names

- [ ] Review the package mapping table below
- [ ] Verify any packages specific to your setup

**Package Mapping: Ubuntu to Fedora**

| Category | Ubuntu Package | Fedora Package | Notes |
|----------|---------------|----------------|-------|
| **Core** | `curl` | `curl` | Same |
| | `wget` | `wget` | Same |
| | `git` | `git` | Same |
| | `git-lfs` | `git-lfs` | Same |
| | `vim` | `vim-enhanced` | Different name |
| | `stow` | `stow` | Same |
| | `zsh` | `zsh` | Same |
| | `sudo` | `sudo` | Same |
| **Build** | `build-essential` | `@development-tools` | Group package |
| | `libssl-dev` | `openssl-devel` | Different naming convention |
| | `zlib1g-dev` | `zlib-devel` | Different naming convention |
| | `libbz2-dev` | `bzip2-devel` | Different naming convention |
| | `libreadline-dev` | `readline-devel` | Different naming convention |
| | `libsqlite3-dev` | `sqlite-devel` | Different naming convention |
| | `libncursesw5-dev` | `ncurses-devel` | Different naming convention |
| | `xz-utils` | `xz` | Different name |
| | `tk-dev` | `tk-devel` | Different naming convention |
| | `libxml2-dev` | `libxml2-devel` | Different naming convention |
| | `libxmlsec1-dev` | `xmlsec1-devel` | Different naming convention |
| | `libffi-dev` | `libffi-devel` | Different naming convention |
| | `liblzma-dev` | `xz-devel` | Different package |
| **SSH** | `openssh-server` | `openssh-server` | Same |
| **CLI Tools** | `bat` | `bat` | Same |
| | `ripgrep` | `ripgrep` | Same |
| | `fd-find` | `fd-find` | Same (binary is `fd` not `fdfind`) |
| | `jq` | `jq` | Same |
| **Utilities** | `less` | `less` | Same |
| | `tar` | `tar` | Included by default |
| | `gzip` | `gzip` | Included by default |
| | `unzip` | `unzip` | Same |
| | `ca-certificates` | `ca-certificates` | Same |

**Packages Requiring Different Approaches:**

| Package | Ubuntu | Fedora Approach |
|---------|--------|-----------------|
| `fdfind` symlink | `ln -s fdfind fd` | Not needed - Fedora installs as `fd` |
| Development group | Individual packages | Use `dnf group install` |

### 1.2 Create New Dockerfile

- [ ] Create `Dockerfile.fedora` in the `dev-container` directory
- [ ] Copy the structure below, customizing as needed:

```dockerfile
# =============================================================================
# Opencode Development Container (Fedora)
# =============================================================================
# A reproducible development environment with:
# - Python (pyenv), Node.js (nvm), Go
# - Opencode AI coding assistant
# - Full dotfiles configuration
# - SSH access for seamless terminal integration
# =============================================================================

FROM fedora:41

# Prevent interactive prompts
ENV TERM=xterm-256color

# Set timezone
ENV TZ=UTC

# =============================================================================
# Stage 1: System Setup & Core Tools
# =============================================================================

# Update and install essential system packages
RUN dnf update -y && dnf install -y \
    # Core utilities
    curl \
    wget \
    git \
    git-lfs \
    vim-enhanced \
    stow \
    zsh \
    sudo \
    # Build essentials (Fedora uses group install)
    @development-tools \
    openssl-devel \
    zlib-devel \
    bzip2-devel \
    readline-devel \
    sqlite-devel \
    ncurses-devel \
    xz \
    tk-devel \
    libxml2-devel \
    xmlsec1-devel \
    libffi-devel \
    xz-devel \
    # SSH server
    openssh-server \
    # Modern CLI tools
    bat \
    ripgrep \
    fd-find \
    jq \
    # Additional utilities
    less \
    unzip \
    ca-certificates \
    procps-ng \
    findutils \
    && dnf clean all

# Note: Fedora's fd-find installs as 'fd', no symlink needed

# =============================================================================
# Stage 2: User Setup
# =============================================================================

# Create non-root user 'dev' with sudo access
# UID 1000 matches most macOS users for better volume permission handling
RUN useradd -m -s /bin/zsh -u 1000 -G wheel dev && \
    echo "dev ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Switch to dev user for remaining installations
USER dev
WORKDIR /home/dev

# =============================================================================
# Stage 3: Language Runtimes
# =============================================================================

# --- Python (via pyenv) ---
RUN curl https://pyenv.run | bash

ENV PYENV_ROOT="/home/dev/.pyenv"
ENV PATH="$PYENV_ROOT/bin:$PATH"

# Install Python 3.12 (latest stable)
RUN eval "$(pyenv init -)" && \
    pyenv install 3.12.7 && \
    pyenv global 3.12.7

# Upgrade pip and install common tools
RUN eval "$(pyenv init -)" && \
    pip install --upgrade pip && \
    pip install ruff black isort

# --- Node.js (via nvm) ---
ENV NVM_DIR="/home/dev/.nvm"
ENV NODE_VERSION="22.12.0"

RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash && \
    . "$NVM_DIR/nvm.sh" && \
    nvm install $NODE_VERSION && \
    nvm use $NODE_VERSION && \
    nvm alias default $NODE_VERSION

ENV PATH="$NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH"

# Install global npm packages
RUN . "$NVM_DIR/nvm.sh" && npm install -g \
    prettier \
    typescript \
    @tailwindcss/cli \
    svelte-language-server \
    pnpm \
    yarn

# --- Go ---
USER root
ENV GO_VERSION="1.23.4"
RUN wget https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz && \
    tar -C /usr/local -xzf go${GO_VERSION}.linux-amd64.tar.gz && \
    rm go${GO_VERSION}.linux-amd64.tar.gz

ENV PATH="/usr/local/go/bin:/home/dev/go/bin:$PATH"
ENV GOPATH="/home/dev/go"

USER dev

# Install Go tools
RUN go install golang.org/x/tools/cmd/goimports@latest

# =============================================================================
# Stage 4: Development Tools
# =============================================================================

# --- fzf (fuzzy finder) ---
RUN git clone --depth 1 https://github.com/junegunn/fzf.git ~/.fzf && \
    ~/.fzf/install --all

# --- Starship (prompt) ---
USER root
RUN curl -sS https://starship.rs/install.sh | sh -s -- -y
USER dev

# --- Neovim (latest stable) ---
USER root
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ]; then \
        NVIM_ARCH="linux-arm64"; \
    else \
        NVIM_ARCH="linux64"; \
    fi && \
    wget https://github.com/neovim/neovim/releases/latest/download/nvim-${NVIM_ARCH}.tar.gz && \
    tar -C /opt -xzf nvim-${NVIM_ARCH}.tar.gz && \
    rm nvim-${NVIM_ARCH}.tar.gz && \
    ln -s /opt/nvim-${NVIM_ARCH}/bin/nvim /usr/local/bin/nvim

USER dev

# --- Opencode ---
ENV OPENCODE_VERSION="1.1.40"
RUN . "$NVM_DIR/nvm.sh" && npm install -g opencode-ai@${OPENCODE_VERSION}

# Verify installation
RUN . "$NVM_DIR/nvm.sh" && opencode --version

# =============================================================================
# Stage 5: SSH Server Configuration
# =============================================================================

USER root

# Configure SSH
RUN mkdir -p /var/run/sshd && \
    ssh-keygen -A && \
    echo "AllowUsers dev" >> /etc/ssh/sshd_config && \
    sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config && \
    sed -i 's/#PubkeyAuthentication yes/PubkeyAuthentication yes/' /etc/ssh/sshd_config && \
    sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin no/' /etc/ssh/sshd_config

# Create .ssh directory for dev user
RUN mkdir -p /home/dev/.ssh && \
    chown -R dev:dev /home/dev/.ssh && \
    chmod 700 /home/dev/.ssh

# =============================================================================
# Stage 6: Dotfiles Setup
# =============================================================================

USER dev

# Create directories
RUN mkdir -p /home/dev/projects /home/dev/scripts

# Copy setup scripts
COPY --chown=dev:dev scripts/setup-dotfiles.sh /home/dev/scripts/setup-dotfiles.sh
COPY --chown=dev:dev scripts/entrypoint.sh /home/dev/scripts/entrypoint.sh
RUN chmod +x /home/dev/scripts/*.sh

# =============================================================================
# Stage 7: Runtime Configuration
# =============================================================================

EXPOSE 22

ENV SHELL=/bin/zsh

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD pgrep sshd || exit 1

USER root

ENTRYPOINT ["/home/dev/scripts/entrypoint.sh"]
```

### 1.3 Update Entrypoint Scripts

- [ ] Update `scripts/entrypoint.sh` for Fedora compatibility

**Changes needed:**

1. **User group:** Change `sudo` group references to `wheel` (Fedora uses `wheel` for admin users)

2. **Package manager:** If any apt commands exist, change to dnf:
   ```bash
   # Ubuntu
   apt-get update && apt-get install -y <package>
   
   # Fedora
   dnf install -y <package>
   ```

3. **Service management:** SSH daemon path is the same (`/usr/sbin/sshd`)

**No changes needed for:**
- SSH key generation (uses `ssh-keygen`, same on both)
- Git operations (identical)
- Environment variable loading (identical)
- Stow operations (identical)

### 1.4 Test the Build

- [ ] Build the new Fedora image:

```bash
# Build with new Dockerfile
docker build -f Dockerfile.fedora -t opencode-dev:fedora .

# If successful, you'll see: "Successfully tagged opencode-dev:fedora"
```

- [ ] Test the image interactively:

```bash
# Start a test container
docker run -it --rm opencode-dev:fedora /bin/zsh

# Inside container, verify:
cat /etc/fedora-release    # Should show Fedora 41
python --version           # Should show 3.12.x
node --version             # Should show 22.x
go version                 # Should show 1.23.x
nvim --version             # Should work
which fd                   # Should show /usr/bin/fd (not fdfind)
```

- [ ] Verify package availability:

```bash
# Inside container
which bat ripgrep jq stow zsh
```

- [ ] Once verified, update docker-compose.yml to use the new Dockerfile:

```yaml
services:
  opencode:
    build:
      context: .
      dockerfile: Dockerfile.fedora  # Changed from Dockerfile
```

---

## Phase 2: SSH Key Architecture

**Goal:** Implement a three-tier SSH key system that provides appropriate access levels for each container type.

### Prerequisites for This Phase

- GitHub account with repository admin access
- Understanding of SSH key types (see 2.1)
- Container images built (Phase 1 complete)

### 2.1 Understand the Three Key Types

Before implementing, understand the different key types:

**SSH Key Types Comparison**

| Key Type | Scope | Added To | Use Case |
|----------|-------|----------|----------|
| **Account Key** | All repos you can access | GitHub Settings > SSH Keys | Personal development with full access |
| **Deploy Key** | Single repository only | Repo Settings > Deploy Keys | CI/CD, restricted agents |
| **Deploy Key (write)** | Single repo, read+write | Repo Settings > Deploy Keys | Agents that need to push |

**Our Key Assignment**

| Container | Key Type | GitHub Location | Permissions |
|-----------|----------|-----------------|-------------|
| `dev-full` | Account Key | github.com/settings/keys | All repos, all branches |
| `openclaw-agent` | Deploy Key (write) | Dotfiles repo settings | Dotfiles only, branches only* |
| `opencode-web` | Deploy Key (write) | Dotfiles repo settings | Dotfiles only, branches only* |

*Branch protection rules enforce "branches only" - the key itself allows write access.

### 2.2 Update Entrypoint to Generate Named Keys

- [ ] Modify `scripts/entrypoint.sh` to support different key names based on container type

**Add this section near the top of entrypoint.sh (after the shebang):**

```bash
# =============================================================================
# Container Identity
# =============================================================================
# CONTAINER_TYPE determines the SSH key name and permissions model
# Values: dev-full, openclaw-agent, opencode-web
# Default: dev-full (backward compatible with existing setup)

CONTAINER_TYPE="${CONTAINER_TYPE:-dev-full}"

# Map container type to SSH key name
case "$CONTAINER_TYPE" in
    "dev-full")
        SSH_KEY_NAME="dev_container_ed25519"
        KEY_COMMENT="dev-container-full-access"
        ;;
    "openclaw-agent")
        SSH_KEY_NAME="openclaw_agent_ed25519"
        KEY_COMMENT="openclaw-agent-dotfiles-deploy"
        ;;
    "opencode-web")
        SSH_KEY_NAME="opencode_web_ed25519"
        KEY_COMMENT="opencode-web-dotfiles-deploy"
        ;;
    *)
        echo "ERROR: Unknown CONTAINER_TYPE: $CONTAINER_TYPE"
        echo "Valid values: dev-full, openclaw-agent, opencode-web"
        exit 1
        ;;
esac

echo "Container type: $CONTAINER_TYPE"
echo "SSH key name: $SSH_KEY_NAME"
```

- [ ] Update the SSH key generation section:

**Replace the existing SSH key generation block with:**

```bash
# =============================================================================
# SSH Key Setup
# =============================================================================

echo "Setting up SSH keys for $CONTAINER_TYPE..."

mkdir -p /home/dev/.ssh
chmod 700 /home/dev/.ssh
chown dev:dev /home/dev/.ssh

SSH_KEY="/home/dev/.ssh/$SSH_KEY_NAME"
if [ ! -f "$SSH_KEY" ]; then
    echo "Generating SSH key: $SSH_KEY_NAME"
    su - dev -c "ssh-keygen -t ed25519 -f $SSH_KEY -N '' -C '$KEY_COMMENT'"
    echo ""
    echo "============================================================"
    echo "  ACTION REQUIRED: Add this public key to GitHub"
    echo "============================================================"
    echo ""
    
    case "$CONTAINER_TYPE" in
        "dev-full")
            echo "This is an ACCOUNT KEY - add to your GitHub account:"
            echo "  URL: https://github.com/settings/ssh/new"
            echo "  Title: Dev Container (Full Access)"
            ;;
        "openclaw-agent"|"opencode-web")
            echo "This is a DEPLOY KEY - add to the Dotfiles repository:"
            echo "  URL: https://github.com/YOUR_USERNAME/Dotfiles/settings/keys"
            echo "  Title: $CONTAINER_TYPE"
            echo "  IMPORTANT: Check 'Allow write access'"
            ;;
    esac
    
    echo ""
    echo "Key:"
    echo ""
    cat "${SSH_KEY}.pub"
    echo ""
    echo "============================================================"
    echo ""
    echo "Press Enter after adding the key..."
    read -r
else
    echo "SSH key exists: $SSH_KEY_NAME"
fi

# Create SSH config pointing to the correct key
cat > /home/dev/.ssh/config << EOF
# SSH Configuration for $CONTAINER_TYPE
# Auto-generated - do not edit

Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/$SSH_KEY_NAME
    IdentitiesOnly yes

Host *
    AddKeysToAgent no
    StrictHostKeyChecking accept-new
EOF

chmod 600 /home/dev/.ssh/config
chown dev:dev /home/dev/.ssh/config
```

### 2.3 Document Key Setup Process

#### Adding an Account Key (dev-full container)

Account keys give access to all repositories your GitHub account can access.

- [ ] **Step 1:** Start the dev-full container and copy the public key from logs

- [ ] **Step 2:** Navigate to GitHub SSH settings:
  - Go to: https://github.com/settings/keys
  - Or: GitHub > Settings > SSH and GPG keys > New SSH key

- [ ] **Step 3:** Add the key:
  - **Title:** `Dev Container (Full Access)`
  - **Key type:** `Authentication Key`
  - **Key:** Paste the `ssh-ed25519 AAAA...` key
  - Click **Add SSH key**

- [ ] **Step 4:** Verify in container:
  ```bash
  ssh -T git@github.com
  # Should see: "Hi username! You've successfully authenticated..."
  ```

#### Adding a Deploy Key (openclaw-agent or opencode-web)

Deploy keys only give access to a single repository.

- [ ] **Step 1:** Start the container and copy the public key from logs

- [ ] **Step 2:** Navigate to the Dotfiles repository settings:
  - Go to: https://github.com/YOUR_USERNAME/Dotfiles/settings/keys
  - Or: Dotfiles repo > Settings > Deploy keys > Add deploy key

- [ ] **Step 3:** Add the deploy key:
  - **Title:** `openclaw-agent` (or `opencode-web`)
  - **Key:** Paste the `ssh-ed25519 AAAA...` key
  - **CRITICAL:** Check **"Allow write access"**
  - Click **Add key**

- [ ] **Step 4:** Verify in container:
  ```bash
  ssh -T git@github.com
  # Should see: "Hi YOUR_USERNAME/Dotfiles! You've successfully authenticated..."
  # Note: It shows the REPO name, not your username - this confirms it's a deploy key
  ```

### 2.4 Set Up Branch Protection on Dotfiles Repo

Branch protection prevents direct pushes to `main`, forcing agents to use pull requests.

- [ ] **Step 1:** Navigate to branch protection settings:
  - Go to: https://github.com/YOUR_USERNAME/Dotfiles/settings/branches
  - Or: Dotfiles repo > Settings > Branches

- [ ] **Step 2:** Add a branch protection rule:
  - Click **Add branch protection rule** (or **Add rule**)

- [ ] **Step 3:** Configure the rule:
  
  | Setting | Value | Purpose |
  |---------|-------|---------|
  | **Branch name pattern** | `main` | Protects the main branch |
  | **Require a pull request before merging** | Checked | Forces PR workflow |
  | **Require approvals** | 1 (optional) | Requires human review |
  | **Dismiss stale PR approvals** | Checked | Re-review after changes |
  | **Require review from Code Owners** | Optional | If you have CODEOWNERS file |
  | **Require status checks** | Optional | If you have CI |
  | **Do not allow bypassing** | **Unchecked** | Allows YOUR account key to push directly |
  | **Restrict who can push** | Optional | Can limit to specific keys |

- [ ] **Step 4:** Click **Create** or **Save changes**

- [ ] **Step 5:** Verify protection:
  ```bash
  # From an agent container (not dev-full), try:
  git checkout main
  git commit --allow-empty -m "Test protection"
  git push origin main
  # Should FAIL with: "protected branch hook declined"
  
  # This should work:
  git checkout -b test-branch
  git push origin test-branch
  # Should succeed
  ```

**Important Notes:**

- Your personal account (with account key) can bypass protection if "Do not allow bypassing" is unchecked
- Deploy keys cannot bypass protection rules
- This creates an asymmetric permission model: you can push to main, agents cannot

---

## Phase 3: Cedar Policies

**Goal:** Create Cedar authorization policies that define fine-grained permissions for each container type.

### Prerequisites for This Phase

- Understanding of the permission model from Phase 2
- Familiarity with authorization concepts
- No software installation needed yet (policies are prepared for Leash integration)

### 3.1 Understand Cedar Policy Syntax

Cedar is a policy language created by AWS for fine-grained authorization. It's used by tools like Leash to control what actions AI agents can perform.

**Basic Cedar Concepts:**

| Concept | Description | Example |
|---------|-------------|---------|
| **Principal** | Who is making the request | `principal == Agent::"openclaw"` |
| **Action** | What operation is requested | `action == Action::"git_push"` |
| **Resource** | What is being accessed | `resource == Repository::"Dotfiles"` |
| **permit** | Allow the action | `permit(principal, action, resource)` |
| **forbid** | Deny the action | `forbid(principal, action, resource)` |
| **when** | Conditional clause | `when { resource.branch != "main" }` |
| **unless** | Negative conditional | `unless { resource.is_protected }` |

**Policy Evaluation Order:**

1. If any `forbid` matches, action is denied (forbid wins)
2. If any `permit` matches and no forbid, action is allowed
3. If nothing matches, action is denied (default deny)

**Official Documentation:** https://www.cedarpolicy.com/

### 3.2 Create Directory Structure

- [ ] Create the policies directory:

```bash
mkdir -p ~/Dotfiles/dev-container/policies
```

- [ ] Create the directory structure:

```
dev-container/
  policies/
    schema.cedarschema     # Type definitions
    openclaw-agent.cedar   # Openclaw agent policy
    opencode-web.cedar     # Opencode web policy
    dev-full.cedar         # Full dev access (reference/monitoring)
```

### 3.3 Write Schema Definition

- [ ] Create `policies/schema.cedarschema`:

```cedarschema
// =============================================================================
// Cedar Schema for Dev Container Authorization
// =============================================================================
// Defines the types used in our authorization policies

namespace DevContainer {
    // Entity types
    entity Agent;
    entity Repository;
    entity Branch;
    entity File;
    entity Tool;
    
    // Actions that can be performed
    action git_clone appliesTo {
        principal: [Agent],
        resource: [Repository]
    };
    
    action git_push appliesTo {
        principal: [Agent],
        resource: [Branch]
    };
    
    action git_pull appliesTo {
        principal: [Agent],
        resource: [Repository]
    };
    
    action file_read appliesTo {
        principal: [Agent],
        resource: [File]
    };
    
    action file_write appliesTo {
        principal: [Agent],
        resource: [File]
    };
    
    action file_delete appliesTo {
        principal: [Agent],
        resource: [File]
    };
    
    action execute_command appliesTo {
        principal: [Agent],
        resource: [Tool]
    };
    
    action network_request appliesTo {
        principal: [Agent],
        resource: [Repository]  // or URL entity
    };
}
```

### 3.4 Write openclaw-agent.cedar

- [ ] Create `policies/openclaw-agent.cedar`:

```cedar
// =============================================================================
// Cedar Policy: openclaw-agent
// =============================================================================
// Purpose: Define permissions for the Openclaw CLI agent container
// 
// This agent should be able to:
//   - Clone and pull the Dotfiles repository
//   - Push to feature branches (NOT main)
//   - Read/write files in workspace
//   - Execute development tools
//
// This agent should NOT be able to:
//   - Push to main branch
//   - Access other repositories
//   - Delete critical files
//   - Execute destructive commands
// =============================================================================

// -----------------------------------------------------------------------------
// PERMIT: Repository Operations
// -----------------------------------------------------------------------------

// Allow cloning the Dotfiles repository
permit(
    principal == DevContainer::Agent::"openclaw-agent",
    action == DevContainer::Action::"git_clone",
    resource == DevContainer::Repository::"Dotfiles"
);

// Allow pulling from Dotfiles repository
permit(
    principal == DevContainer::Agent::"openclaw-agent",
    action == DevContainer::Action::"git_pull",
    resource == DevContainer::Repository::"Dotfiles"
);

// Allow pushing to non-main branches only
permit(
    principal == DevContainer::Agent::"openclaw-agent",
    action == DevContainer::Action::"git_push",
    resource
)
when {
    resource.repository == "Dotfiles" &&
    resource.name != "main" &&
    resource.name != "master"
};

// -----------------------------------------------------------------------------
// FORBID: Dangerous Operations
// -----------------------------------------------------------------------------

// NEVER allow pushing to main branch
forbid(
    principal == DevContainer::Agent::"openclaw-agent",
    action == DevContainer::Action::"git_push",
    resource
)
when {
    resource.name == "main" || resource.name == "master"
};

// NEVER allow access to other repositories
forbid(
    principal == DevContainer::Agent::"openclaw-agent",
    action == DevContainer::Action::"git_clone",
    resource
)
unless {
    resource == DevContainer::Repository::"Dotfiles"
};

// NEVER allow deleting protected files
forbid(
    principal == DevContainer::Agent::"openclaw-agent",
    action == DevContainer::Action::"file_delete",
    resource
)
when {
    resource.path like "*.cedar" ||
    resource.path like "*/.git/*" ||
    resource.path like "*/entrypoint.sh"
};

// -----------------------------------------------------------------------------
// PERMIT: File Operations (within workspace)
// -----------------------------------------------------------------------------

// Allow reading files in the workspace
permit(
    principal == DevContainer::Agent::"openclaw-agent",
    action == DevContainer::Action::"file_read",
    resource
)
when {
    resource.path like "/home/dev/*"
};

// Allow writing files in the workspace (except protected paths)
permit(
    principal == DevContainer::Agent::"openclaw-agent",
    action == DevContainer::Action::"file_write",
    resource
)
when {
    resource.path like "/home/dev/*"
}
unless {
    resource.path like "/home/dev/.ssh/*" ||
    resource.path like "/home/dev/.env"
};

// -----------------------------------------------------------------------------
// PERMIT: Tool Execution
// -----------------------------------------------------------------------------

// Allow safe development tools
permit(
    principal == DevContainer::Agent::"openclaw-agent",
    action == DevContainer::Action::"execute_command",
    resource
)
when {
    resource in [
        DevContainer::Tool::"git",
        DevContainer::Tool::"npm",
        DevContainer::Tool::"node",
        DevContainer::Tool::"python",
        DevContainer::Tool::"go",
        DevContainer::Tool::"nvim",
        DevContainer::Tool::"cat",
        DevContainer::Tool::"ls",
        DevContainer::Tool::"grep",
        DevContainer::Tool::"find",
        DevContainer::Tool::"stow"
    ]
};

// FORBID destructive commands
forbid(
    principal == DevContainer::Agent::"openclaw-agent",
    action == DevContainer::Action::"execute_command",
    resource
)
when {
    resource in [
        DevContainer::Tool::"rm -rf",
        DevContainer::Tool::"sudo",
        DevContainer::Tool::"chmod 777",
        DevContainer::Tool::"curl | sh",
        DevContainer::Tool::"wget | sh"
    ]
};
```

### 3.5 Write opencode-web.cedar

- [ ] Create `policies/opencode-web.cedar`:

```cedar
// =============================================================================
// Cedar Policy: opencode-web
// =============================================================================
// Purpose: Define permissions for the Opencode web-based agent
// 
// This is similar to openclaw-agent but may have additional restrictions
// for web-based access patterns (e.g., rate limiting considerations,
// additional network restrictions)
// =============================================================================

// -----------------------------------------------------------------------------
// PERMIT: Repository Operations (same as openclaw-agent)
// -----------------------------------------------------------------------------

permit(
    principal == DevContainer::Agent::"opencode-web",
    action == DevContainer::Action::"git_clone",
    resource == DevContainer::Repository::"Dotfiles"
);

permit(
    principal == DevContainer::Agent::"opencode-web",
    action == DevContainer::Action::"git_pull",
    resource == DevContainer::Repository::"Dotfiles"
);

permit(
    principal == DevContainer::Agent::"opencode-web",
    action == DevContainer::Action::"git_push",
    resource
)
when {
    resource.repository == "Dotfiles" &&
    resource.name != "main" &&
    resource.name != "master"
};

// -----------------------------------------------------------------------------
// FORBID: Dangerous Operations (same as openclaw-agent)
// -----------------------------------------------------------------------------

forbid(
    principal == DevContainer::Agent::"opencode-web",
    action == DevContainer::Action::"git_push",
    resource
)
when {
    resource.name == "main" || resource.name == "master"
};

forbid(
    principal == DevContainer::Agent::"opencode-web",
    action == DevContainer::Action::"git_clone",
    resource
)
unless {
    resource == DevContainer::Repository::"Dotfiles"
};

forbid(
    principal == DevContainer::Agent::"opencode-web",
    action == DevContainer::Action::"file_delete",
    resource
)
when {
    resource.path like "*.cedar" ||
    resource.path like "*/.git/*" ||
    resource.path like "*/entrypoint.sh"
};

// -----------------------------------------------------------------------------
// PERMIT: File Operations (more restricted for web)
// -----------------------------------------------------------------------------

permit(
    principal == DevContainer::Agent::"opencode-web",
    action == DevContainer::Action::"file_read",
    resource
)
when {
    resource.path like "/home/dev/Dotfiles/*" ||
    resource.path like "/home/dev/projects/*"
};

permit(
    principal == DevContainer::Agent::"opencode-web",
    action == DevContainer::Action::"file_write",
    resource
)
when {
    resource.path like "/home/dev/Dotfiles/*" ||
    resource.path like "/home/dev/projects/*"
}
unless {
    resource.path like "/home/dev/.ssh/*" ||
    resource.path like "/home/dev/.env" ||
    resource.path like "*/node_modules/*"
};

// -----------------------------------------------------------------------------
// PERMIT: Tool Execution (same safe tools)
// -----------------------------------------------------------------------------

permit(
    principal == DevContainer::Agent::"opencode-web",
    action == DevContainer::Action::"execute_command",
    resource
)
when {
    resource in [
        DevContainer::Tool::"git",
        DevContainer::Tool::"npm",
        DevContainer::Tool::"node",
        DevContainer::Tool::"python",
        DevContainer::Tool::"go",
        DevContainer::Tool::"nvim",
        DevContainer::Tool::"cat",
        DevContainer::Tool::"ls",
        DevContainer::Tool::"grep",
        DevContainer::Tool::"find",
        DevContainer::Tool::"stow"
    ]
};

forbid(
    principal == DevContainer::Agent::"opencode-web",
    action == DevContainer::Action::"execute_command",
    resource
)
when {
    resource in [
        DevContainer::Tool::"rm -rf",
        DevContainer::Tool::"sudo",
        DevContainer::Tool::"chmod 777",
        DevContainer::Tool::"curl | sh",
        DevContainer::Tool::"wget | sh"
    ]
};

// -----------------------------------------------------------------------------
// WEB-SPECIFIC: Additional restrictions
// -----------------------------------------------------------------------------

// Forbid network requests to internal/private IPs (web-specific)
forbid(
    principal == DevContainer::Agent::"opencode-web",
    action == DevContainer::Action::"network_request",
    resource
)
when {
    resource.url like "http://localhost*" ||
    resource.url like "http://127.*" ||
    resource.url like "http://10.*" ||
    resource.url like "http://192.168.*"
};
```

### 3.6 Write dev-full.cedar (Optional Monitoring Policy)

- [ ] Create `policies/dev-full.cedar`:

```cedar
// =============================================================================
// Cedar Policy: dev-full
// =============================================================================
// Purpose: Reference policy for full development access
// 
// This policy is primarily for documentation and monitoring purposes.
// The dev-full container has an account key, so GitHub enforces access.
// This policy can be used with Leash for logging/auditing.
// =============================================================================

// Allow all git operations (account key handles actual auth)
permit(
    principal == DevContainer::Agent::"dev-full",
    action in [
        DevContainer::Action::"git_clone",
        DevContainer::Action::"git_pull",
        DevContainer::Action::"git_push"
    ],
    resource
);

// Allow all file operations within home
permit(
    principal == DevContainer::Agent::"dev-full",
    action in [
        DevContainer::Action::"file_read",
        DevContainer::Action::"file_write",
        DevContainer::Action::"file_delete"
    ],
    resource
)
when {
    resource.path like "/home/dev/*"
};

// Allow all development tools
permit(
    principal == DevContainer::Agent::"dev-full",
    action == DevContainer::Action::"execute_command",
    resource
);

// Log (but allow) potentially dangerous operations for auditing
// Note: Leash would log these as "elevated" operations
@annotation("audit_level", "elevated")
permit(
    principal == DevContainer::Agent::"dev-full",
    action == DevContainer::Action::"execute_command",
    resource
)
when {
    resource in [
        DevContainer::Tool::"sudo",
        DevContainer::Tool::"rm -rf"
    ]
};
```

---

## Phase 4: Docker Compose for Mac Mini

**Goal:** Create a Docker Compose configuration for hosting all three containers on a Mac Mini server.

### Prerequisites for This Phase

- Mac Mini with Docker installed
- Network access to the Mac Mini
- SSH keys generated (Phase 2)
- Cedar policies written (Phase 3)

### 4.1 Create docker-compose.mac-mini.yml

- [ ] Create `docker-compose.mac-mini.yml` in the `dev-container` directory:

```yaml
# =============================================================================
# Three-Container Development Environment - Mac Mini Server
# =============================================================================
# This configuration runs all three container types on a Mac Mini host.
# 
# Usage:
#   docker compose -f docker-compose.mac-mini.yml up -d
#   docker compose -f docker-compose.mac-mini.yml logs -f
#   docker compose -f docker-compose.mac-mini.yml down
#
# Prerequisites:
#   - ~/.env file with API keys
#   - SSH keys added to GitHub (account key + 2 deploy keys)
#   - Branch protection configured on Dotfiles repo
# =============================================================================

services:
  # ---------------------------------------------------------------------------
  # dev-full: Full Development Access
  # ---------------------------------------------------------------------------
  # Personal development container with account-level GitHub access
  # Can push to any repo, any branch (including main)
  
  dev-full:
    build:
      context: .
      dockerfile: Dockerfile.fedora
    container_name: dev-full
    hostname: dev-full
    
    environment:
      - CONTAINER_TYPE=dev-full
      - TZ=America/New_York
      - SHELL=/bin/zsh
    
    ports:
      - "2222:22"  # SSH access
    
    volumes:
      # Named volumes for persistence
      - dev-full-home:/home/dev
      - dev-full-ssh:/home/dev/.ssh
      
      # Bind mount for API keys (read-only)
      - ~/.env:/home/dev/.env:ro
    
    restart: unless-stopped
    
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 8G
        reservations:
          cpus: '1'
          memory: 2G
    
    networks:
      - dev-network

  # ---------------------------------------------------------------------------
  # openclaw-agent: CLI AI Agent
  # ---------------------------------------------------------------------------
  # Restricted container for AI coding agent (CLI)
  # Can only access Dotfiles repo, cannot push to main
  
  openclaw-agent:
    build:
      context: .
      dockerfile: Dockerfile.fedora
    container_name: openclaw-agent
    hostname: openclaw-agent
    
    environment:
      - CONTAINER_TYPE=openclaw-agent
      - TZ=America/New_York
      - SHELL=/bin/zsh
    
    ports:
      - "2223:22"  # SSH access on different port
    
    volumes:
      # Named volumes for persistence (separate from dev-full)
      - openclaw-home:/home/dev
      - openclaw-ssh:/home/dev/.ssh
      
      # Bind mount for API keys (read-only)
      - ~/.env:/home/dev/.env:ro
      
      # Mount Cedar policies (read-only)
      - ./policies:/home/dev/policies:ro
    
    restart: unless-stopped
    
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '0.5'
          memory: 1G
    
    networks:
      - dev-network

  # ---------------------------------------------------------------------------
  # opencode-web: Web-based AI Agent
  # ---------------------------------------------------------------------------
  # Restricted container for web-based AI assistant
  # Similar restrictions to openclaw-agent
  
  opencode-web:
    build:
      context: .
      dockerfile: Dockerfile.fedora
    container_name: opencode-web
    hostname: opencode-web
    
    environment:
      - CONTAINER_TYPE=opencode-web
      - TZ=America/New_York
      - SHELL=/bin/zsh
    
    ports:
      - "2224:22"   # SSH access
      - "3000:3000" # Web UI port (if applicable)
    
    volumes:
      # Named volumes for persistence (separate from others)
      - opencode-web-home:/home/dev
      - opencode-web-ssh:/home/dev/.ssh
      
      # Bind mount for API keys (read-only)
      - ~/.env:/home/dev/.env:ro
      
      # Mount Cedar policies (read-only)
      - ./policies:/home/dev/policies:ro
    
    restart: unless-stopped
    
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '0.5'
          memory: 1G
    
    networks:
      - dev-network

# =============================================================================
# Named Volumes
# =============================================================================
# Each container has its own home and SSH volumes to ensure isolation
# 
# Backup commands:
#   docker run --rm -v dev-full-home:/data -v $(pwd):/backup \
#     alpine tar czf /backup/dev-full-backup.tar.gz /data
#
# Restore commands:
#   docker run --rm -v dev-full-home:/data -v $(pwd):/backup \
#     alpine tar xzf /backup/dev-full-backup.tar.gz -C /

volumes:
  # dev-full container
  dev-full-home:
    driver: local
  dev-full-ssh:
    driver: local
  
  # openclaw-agent container
  openclaw-home:
    driver: local
  openclaw-ssh:
    driver: local
  
  # opencode-web container
  opencode-web-home:
    driver: local
  opencode-web-ssh:
    driver: local

# =============================================================================
# Networks
# =============================================================================
# Containers share a network for potential inter-container communication
# but are isolated from the host network

networks:
  dev-network:
    driver: bridge
```

### 4.2 Configure Volumes

**Volume Purposes:**

| Volume | Container | Purpose |
|--------|-----------|---------|
| `dev-full-home` | dev-full | Projects, configs, shell history |
| `dev-full-ssh` | dev-full | Account SSH key for GitHub |
| `openclaw-home` | openclaw-agent | Agent workspace |
| `openclaw-ssh` | openclaw-agent | Deploy key for Dotfiles |
| `opencode-web-home` | opencode-web | Web agent workspace |
| `opencode-web-ssh` | opencode-web | Deploy key for Dotfiles |

**Why Separate Volumes?**

- **Isolation:** Each container's data is independent
- **Security:** Agent containers can't access dev-full's SSH key
- **Backup:** Can backup/restore each container independently
- **Testing:** Can reset agent containers without affecting dev-full

### 4.3 Configure Environment Variables

- [ ] Ensure `~/.env` exists on the Mac Mini with required keys:

```bash
# Create or edit ~/.env on Mac Mini
cat > ~/.env << 'EOF'
# =============================================================================
# API Keys for Dev Containers
# =============================================================================
# SECURITY: This file should be chmod 600 and owned by you
# It's bind-mounted read-only into containers

# Required: Anthropic Claude API
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here

# Required: Tavily Search (for MCP)
TAVILY_API_KEY=tvly-your-key-here

# Optional: OpenRouter (alternative models)
OPENROUTER_API_KEY=sk-or-your-key-here

# Optional: Google AI
GOOGLE_AI_API_KEY=your-key-here

# Container context (not used in multi-container setup, but kept for compatibility)
OPENCODE_CONTEXT=home
EOF

# Set secure permissions
chmod 600 ~/.env
```

**Security Considerations:**

| Risk | Mitigation |
|------|------------|
| API keys in plain text | File is chmod 600, read-only mount |
| Keys visible in container | Bind mount is read-only |
| Keys in Docker logs | Keys loaded as env vars, not printed |
| Key theft if container compromised | Use separate API keys if concerned; revoke if needed |

### 4.4 Test Deployment

- [ ] **Step 1:** Copy files to Mac Mini

```bash
# From your local machine
scp -r ~/Dotfiles/dev-container mac-mini:~/Dotfiles/dev-container
```

- [ ] **Step 2:** SSH to Mac Mini and start containers

```bash
ssh mac-mini
cd ~/Dotfiles/dev-container

# Build all containers
docker compose -f docker-compose.mac-mini.yml build

# Start all containers
docker compose -f docker-compose.mac-mini.yml up -d

# Watch logs (all containers)
docker compose -f docker-compose.mac-mini.yml logs -f
```

- [ ] **Step 3:** Add SSH keys to GitHub when prompted

Each container will pause and show its public key. Add:
1. `dev-full` key as account key: https://github.com/settings/keys
2. `openclaw-agent` key as deploy key: https://github.com/YOUR_USER/Dotfiles/settings/keys
3. `opencode-web` key as deploy key: same location, different title

- [ ] **Step 4:** Verify each container

```bash
# Test dev-full
ssh -p 2222 dev@mac-mini
ssh -T git@github.com  # Should show "Hi YOUR_USERNAME!"
exit

# Test openclaw-agent
ssh -p 2223 dev@mac-mini
ssh -T git@github.com  # Should show "Hi YOUR_USERNAME/Dotfiles!"
exit

# Test opencode-web
ssh -p 2224 dev@mac-mini
ssh -T git@github.com  # Should show "Hi YOUR_USERNAME/Dotfiles!"
exit
```

- [ ] **Step 5:** Test permission restrictions

```bash
# From openclaw-agent container
ssh -p 2223 dev@mac-mini

# This should work
cd ~/Dotfiles
git checkout -b test-agent-branch
git commit --allow-empty -m "Test from agent"
git push origin test-agent-branch

# This should FAIL (branch protection)
git checkout main
git commit --allow-empty -m "This should fail"
git push origin main
# Expected: "remote: error: GH006: Protected branch update failed"
```

---

## Phase 5: Leash Integration (Future)

**Goal:** Integrate Leash to enforce Cedar policies at runtime, providing defense-in-depth beyond GitHub's branch protection.

### Prerequisites for This Phase

- Leash released and stable (check: https://github.com/anthropics/leash)
- Cedar policies written (Phase 3)
- Containers running (Phase 4)

### 5.1 Install Leash

- [ ] Check Leash availability and installation method:

```bash
# Check if Leash is available (placeholder - adjust when released)
# Option 1: Go install
go install github.com/anthropics/leash@latest

# Option 2: Download binary
curl -L https://github.com/anthropics/leash/releases/latest/download/leash-linux-amd64 -o /usr/local/bin/leash
chmod +x /usr/local/bin/leash

# Option 3: Package manager (if available)
# brew install leash
# dnf install leash
```

- [ ] Verify installation:

```bash
leash --version
```

### 5.2 Configure Leash

- [ ] Create Leash configuration directory:

```bash
mkdir -p ~/.config/leash
```

- [ ] Create `~/.config/leash/config.toml`:

```toml
# =============================================================================
# Leash Configuration
# =============================================================================
# Configures Leash to enforce Cedar policies on AI agent actions

[general]
# Log level: debug, info, warn, error
log_level = "info"

# Log file location
log_file = "/var/log/leash/leash.log"

[policies]
# Directory containing Cedar policy files
policy_dir = "/home/dev/policies"

# Schema file for type checking
schema_file = "/home/dev/policies/schema.cedarschema"

# Policy files to load (in order)
policy_files = [
    "openclaw-agent.cedar",
    "opencode-web.cedar",
    "dev-full.cedar"
]

[enforcement]
# How to handle policy violations
# "enforce" - block the action
# "audit" - log but allow
# "disabled" - no policy checking
mode = "enforce"

# Actions to take on violation
on_violation = "block_and_log"

[identity]
# How to determine the agent identity
# Uses CONTAINER_TYPE environment variable
source = "environment"
env_var = "CONTAINER_TYPE"

# Mapping from container type to Cedar principal
[identity.mapping]
"dev-full" = "DevContainer::Agent::\"dev-full\""
"openclaw-agent" = "DevContainer::Agent::\"openclaw-agent\""
"opencode-web" = "DevContainer::Agent::\"opencode-web\""

[audit]
# Audit log settings
enabled = true
log_all_requests = true
log_file = "/var/log/leash/audit.log"

# Retention (days)
retention_days = 30
```

### 5.3 Run Containers Through Leash

- [ ] Modify entrypoint to start Leash wrapper (add to `entrypoint.sh`):

```bash
# =============================================================================
# Leash Integration (Optional)
# =============================================================================

if command -v leash &> /dev/null && [ -f /home/dev/policies/schema.cedarschema ]; then
    echo "Starting Leash policy enforcement..."
    
    # Start Leash daemon
    leash daemon start --config /home/dev/.config/leash/config.toml &
    LEASH_PID=$!
    
    echo "Leash daemon started (PID: $LEASH_PID)"
    
    # Wait for Leash to be ready
    sleep 2
    
    # Verify Leash is running
    if leash status &>/dev/null; then
        echo "Leash policy enforcement active"
    else
        echo "WARNING: Leash failed to start, continuing without policy enforcement"
    fi
else
    echo "Leash not installed or policies not found, skipping policy enforcement"
fi
```

- [ ] Alternative: Use Leash as a shell wrapper

```bash
# Instead of starting opencode directly, wrap it with leash
# In the container:
alias opencode='leash exec -- opencode'
alias git='leash exec -- git'
```

### 5.4 Verify Policy Enforcement

- [ ] **Test 1:** Verify allowed actions work

```bash
# In openclaw-agent container
leash exec -- git clone git@github.com:YOUR_USER/Dotfiles.git
# Should succeed

leash exec -- git checkout -b test-branch
leash exec -- git push origin test-branch
# Should succeed
```

- [ ] **Test 2:** Verify forbidden actions are blocked

```bash
# In openclaw-agent container
leash exec -- git checkout main
leash exec -- git push origin main
# Should be blocked by Leash BEFORE reaching GitHub
# Log should show: "Policy violation: Action git_push denied for resource main"
```

- [ ] **Test 3:** Check audit logs

```bash
# View Leash audit log
cat /var/log/leash/audit.log | tail -20

# Should show entries like:
# {"time":"...","principal":"openclaw-agent","action":"git_push","resource":"main","decision":"DENY","reason":"Policy forbids push to main branch"}
```

- [ ] **Test 4:** Test file access policies

```bash
# In openclaw-agent container
leash exec -- cat /home/dev/.env
# Should be blocked

leash exec -- cat /home/dev/Dotfiles/README.md
# Should succeed
```

---

## Phase 6: Remote Access (Future)

**Goal:** Enable secure remote access to the Mac Mini containers from anywhere.

### Prerequisites for This Phase

- Mac Mini with containers running (Phase 4)
- Network access to configure the Mac Mini
- Tailscale account (recommended) or VPN solution

### 6.1 Choose Access Method

**Options Comparison:**

| Method | Pros | Cons | Recommended For |
|--------|------|------|-----------------|
| **Tailscale** | Easy setup, secure, cross-platform | Requires account, installs client | Personal use |
| **WireGuard** | Fast, minimal, no account | More complex setup | Advanced users |
| **SSH Tunnel** | No additional software | Port management, less convenient | Quick testing |
| **Cloudflare Tunnel** | No open ports, free tier | Cloudflare dependency | Public access |

**Recommendation:** Tailscale for ease of use and security.

### 6.2 Set Up Tailscale

- [ ] **Step 1:** Install Tailscale on Mac Mini

```bash
# On Mac Mini (macOS)
brew install tailscale

# Or download from: https://tailscale.com/download/mac
```

- [ ] **Step 2:** Authenticate Tailscale

```bash
# Start Tailscale
sudo tailscaled &

# Authenticate (opens browser)
tailscale up

# Follow the authentication flow in browser
# Note: You'll create a Tailscale account if you don't have one
```

- [ ] **Step 3:** Install Tailscale on your client devices

```bash
# On your laptop (macOS)
brew install tailscale
tailscale up

# On mobile, download the app from App Store / Play Store
```

- [ ] **Step 4:** Get Mac Mini's Tailscale IP

```bash
# On Mac Mini
tailscale ip -4
# Example output: 100.64.123.45
```

- [ ] **Step 5:** Test connectivity

```bash
# From your laptop
ping 100.64.123.45  # Mac Mini's Tailscale IP

# SSH to containers via Tailscale
ssh -p 2222 dev@100.64.123.45  # dev-full
ssh -p 2223 dev@100.64.123.45  # openclaw-agent
ssh -p 2224 dev@100.64.123.45  # opencode-web
```

### 6.3 Configure Access Controls

- [ ] **Step 1:** Log in to Tailscale admin console

Go to: https://login.tailscale.com/admin/acls

- [ ] **Step 2:** Configure ACLs (Access Control Lists)

```json
{
  "acls": [
    {
      "action": "accept",
      "src": ["autogroup:members"],
      "dst": ["*:*"]
    }
  ],
  "tagOwners": {
    "tag:server": ["autogroup:admin"]
  },
  "hosts": {
    "mac-mini": "100.64.123.45"
  }
}
```

- [ ] **Step 3:** (Optional) Create MagicDNS name

In Tailscale admin, enable MagicDNS to use friendly names:
```bash
# Instead of:
ssh -p 2222 dev@100.64.123.45

# Use:
ssh -p 2222 dev@mac-mini.tailnet-name.ts.net
```

- [ ] **Step 4:** Add SSH config entries

```ssh-config
# ~/.ssh/config

Host dev-full
    HostName mac-mini.tailnet-name.ts.net  # Or Tailscale IP
    Port 2222
    User dev
    StrictHostKeyChecking no

Host openclaw
    HostName mac-mini.tailnet-name.ts.net
    Port 2223
    User dev
    StrictHostKeyChecking no

Host opencode-web
    HostName mac-mini.tailnet-name.ts.net
    Port 2224
    User dev
    StrictHostKeyChecking no
```

Now you can connect with:
```bash
ssh dev-full
ssh openclaw
ssh opencode-web
```

---

## Validation Checklist

After completing all phases, verify the setup with these tests:

### Access Verification

- [ ] **dev-full can push to main on any repo**
  ```bash
  ssh dev-full
  cd ~/projects
  git clone git@github.com:YOUR_USER/any-repo.git
  cd any-repo
  git commit --allow-empty -m "Test main push"
  git push origin main
  # Should succeed
  ```

- [ ] **openclaw-agent can only push branches (not main) on Dotfiles**
  ```bash
  ssh openclaw
  cd ~/Dotfiles
  
  # This should work:
  git checkout -b agent-feature
  git commit --allow-empty -m "Agent commit"
  git push origin agent-feature
  
  # This should FAIL:
  git checkout main
  git push origin main
  # Expected error: "remote: error: GH006: Protected branch update failed"
  ```

- [ ] **opencode-web has appropriate access**
  ```bash
  ssh opencode-web
  # Same tests as openclaw-agent
  ```

### Policy Enforcement (When Leash is Integrated)

- [ ] **Leash policies are enforced**
  ```bash
  ssh openclaw
  leash status  # Should show "enforcing"
  
  # Should be blocked before reaching Git:
  leash exec -- cat /home/dev/.env
  # Expected: "Policy violation: file_read denied for resource /home/dev/.env"
  ```

### Remote Access (When Configured)

- [ ] **Remote access works**
  ```bash
  # From any device on Tailscale
  ssh dev-full
  # Should connect successfully
  ```

---

## Troubleshooting

### Container Won't Build

**Symptom:** `docker build` fails with package errors

**Solutions:**
```bash
# Check if Fedora repos are accessible
docker run --rm fedora:41 dnf check-update

# Clear Docker cache and rebuild
docker builder prune
docker compose -f docker-compose.mac-mini.yml build --no-cache

# Check for disk space
docker system df
docker system prune  # Clean up unused images/containers
```

### SSH Key Not Working

**Symptom:** `Permission denied (publickey)` when connecting to GitHub

**Solutions:**
```bash
# Check the key exists
ls -la ~/.ssh/

# Check the key is loaded in SSH config
cat ~/.ssh/config

# Test with verbose output
ssh -vT git@github.com

# Regenerate the key
rm ~/.ssh/*_ed25519*
# Restart container - will generate new key
docker restart <container>

# Re-add the new key to GitHub
```

### Permission Denied Errors

**Symptom:** Agent can't push to feature branch

**Possible Causes:**
1. Deploy key not marked as "write access"
2. Branch protection rule misconfigured
3. Wrong SSH key being used

**Solutions:**
```bash
# Verify which key is being used
ssh -vT git@github.com 2>&1 | grep "Offering"

# Check deploy key settings
# Go to: https://github.com/YOUR_USER/Dotfiles/settings/keys
# Verify "Allow write access" is checked

# Check branch protection rules
# Go to: https://github.com/YOUR_USER/Dotfiles/settings/branches
```

### Leash Policy Not Enforcing

**Symptom:** Actions that should be blocked are allowed

**Solutions:**
```bash
# Check Leash is running
leash status

# Verify policy files are loaded
leash policies list

# Check for policy syntax errors
leash validate /home/dev/policies/

# View debug logs
tail -f /var/log/leash/leash.log

# Restart Leash
leash daemon restart
```

### Network Connectivity Issues

**Symptom:** Can't connect to containers remotely

**Solutions:**
```bash
# Check Tailscale status
tailscale status

# Verify Mac Mini is online in Tailscale
tailscale ping mac-mini

# Check if ports are accessible
nc -zv <tailscale-ip> 2222

# Verify Docker port mapping
docker port dev-full

# Check firewall (macOS)
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate
```

---

## Reference

### Port Assignments

| Port | Container | Service |
|------|-----------|---------|
| 2222 | dev-full | SSH |
| 2223 | openclaw-agent | SSH |
| 2224 | opencode-web | SSH |
| 3000 | opencode-web | Web UI (optional) |

### Volume Names

| Volume | Container | Contents |
|--------|-----------|----------|
| `dev-full-home` | dev-full | Home directory |
| `dev-full-ssh` | dev-full | SSH keys (account key) |
| `openclaw-home` | openclaw-agent | Home directory |
| `openclaw-ssh` | openclaw-agent | SSH keys (deploy key) |
| `opencode-web-home` | opencode-web | Home directory |
| `opencode-web-ssh` | opencode-web | SSH keys (deploy key) |

### Key File Locations

| Container | Key Path | Key Type |
|-----------|----------|----------|
| dev-full | `~/.ssh/dev_container_ed25519` | Account key |
| openclaw-agent | `~/.ssh/openclaw_agent_ed25519` | Deploy key |
| opencode-web | `~/.ssh/opencode_web_ed25519` | Deploy key |

### Important Commands

```bash
# Start all containers
docker compose -f docker-compose.mac-mini.yml up -d

# Stop all containers
docker compose -f docker-compose.mac-mini.yml stop

# View logs (all containers)
docker compose -f docker-compose.mac-mini.yml logs -f

# View logs (specific container)
docker compose -f docker-compose.mac-mini.yml logs -f openclaw-agent

# Restart a container
docker restart openclaw-agent

# Enter a container as root
docker exec -u root -it openclaw-agent /bin/bash

# Backup a volume
docker run --rm -v openclaw-home:/data -v $(pwd):/backup \
  alpine tar czf /backup/openclaw-backup.tar.gz /data

# Restore a volume
docker run --rm -v openclaw-home:/data -v $(pwd):/backup \
  alpine tar xzf /backup/openclaw-backup.tar.gz -C /

# Check container resource usage
docker stats

# View SSH key for a container
docker exec -u dev openclaw-agent cat ~/.ssh/openclaw_agent_ed25519.pub

# Test GitHub connection
docker exec -u dev openclaw-agent ssh -T git@github.com
```

---

## Completion Summary

When you've completed all phases, you'll have:

1. **Fedora-based containers** with modern tooling
2. **Three-tier SSH key architecture** with appropriate access levels
3. **Branch protection** preventing agent pushes to main
4. **Cedar policies** defining fine-grained permissions (ready for Leash)
5. **Multi-container deployment** on Mac Mini
6. **Remote access** via Tailscale (optional)

This provides defense-in-depth: even if one security layer fails, others remain.
