# =============================================================================
# Three-Container Development Environment (Fedora 42)
# =============================================================================
# A single image supporting three container personas:
#   - dev-full: Full personal development (account SSH key)
#   - openclaw-agent: AI agent via messaging (deploy key, restricted)
#   - opencode-web: Web-based AI assistant (deploy key, restricted)
#
# The CONTAINER_TYPE environment variable determines behavior at runtime.
# =============================================================================

FROM fedora:42

# Prevent interactive prompts
ENV TERM=xterm-256color
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
    # Modern CLI tools (Fedora has these in repos)
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
    which \
    passwd \
    && dnf clean all

# Note: Fedora's fd-find installs as 'fd', no symlink needed (unlike Ubuntu's fdfind)

# =============================================================================
# Stage 2: User Setup
# =============================================================================

# Create non-root user 'dev' with sudo access
# UID 1000 matches most macOS users for better volume permission handling
# Fedora uses 'wheel' group for sudo access (not 'sudo' like Ubuntu)
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
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ]; then \
        GO_ARCH="arm64"; \
    else \
        GO_ARCH="amd64"; \
    fi && \
    wget https://go.dev/dl/go${GO_VERSION}.linux-${GO_ARCH}.tar.gz && \
    tar -C /usr/local -xzf go${GO_VERSION}.linux-${GO_ARCH}.tar.gz && \
    rm go${GO_VERSION}.linux-${GO_ARCH}.tar.gz

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

# Configure SSH server
RUN mkdir -p /var/run/sshd && \
    ssh-keygen -A && \
    # Allow SSH login for dev user only
    echo "AllowUsers dev" >> /etc/ssh/sshd_config && \
    # Disable password authentication (key-based only for security)
    sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config && \
    sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config && \
    # Enable pubkey authentication
    sed -i 's/#PubkeyAuthentication yes/PubkeyAuthentication yes/' /etc/ssh/sshd_config && \
    # Disable root login
    sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin no/' /etc/ssh/sshd_config && \
    sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config

# Create .ssh directory for dev user
RUN mkdir -p /home/dev/.ssh && \
    chown -R dev:dev /home/dev/.ssh && \
    chmod 700 /home/dev/.ssh

# =============================================================================
# Stage 6: Scripts & Configuration
# =============================================================================

USER dev

# Create directories
RUN mkdir -p /home/dev/projects /home/dev/scripts

# Copy scripts to /opt (outside home volume so they persist)
USER root
RUN mkdir -p /opt/dev-container
COPY --chown=root:root scripts/setup-dotfiles.sh /opt/dev-container/setup-dotfiles.sh
COPY --chown=root:root scripts/entrypoint.sh /opt/dev-container/entrypoint.sh
RUN chmod +x /opt/dev-container/*.sh
USER dev

# =============================================================================
# Stage 7: Runtime Configuration
# =============================================================================

# Expose SSH port (containers will map to different host ports)
EXPOSE 22

# Set default shell
ENV SHELL=/bin/zsh

# Health check to ensure SSH is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD pgrep sshd || exit 1

# Container type defaults to dev-full (full access)
# Override with CONTAINER_TYPE env var for agent containers
ENV CONTAINER_TYPE=dev-full

# Switch to root for entrypoint (needs to start sshd)
USER root

# Use entrypoint script to handle startup
ENTRYPOINT ["/opt/dev-container/entrypoint.sh"]
