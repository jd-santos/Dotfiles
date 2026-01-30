# =============================================================================
# Opencode Development Container
# =============================================================================
# A reproducible development environment with:
# - Python (pyenv), Node.js (nvm), Go
# - Opencode AI coding assistant
# - Full dotfiles configuration
# - SSH access for seamless terminal integration
# =============================================================================

FROM ubuntu:24.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Set timezone
ENV TZ=UTC

# =============================================================================
# Stage 1: System Setup & Core Tools
# =============================================================================

# Update and install essential system packages
RUN apt-get update && apt-get install -y \
    # Core utilities
    curl \
    wget \
    git \
    git-lfs \
    vim \
    stow \
    zsh \
    sudo \
    # Build essentials (needed for pyenv, nvm, etc.)
    build-essential \
    libssl-dev \
    zlib1g-dev \
    libbz2-dev \
    libreadline-dev \
    libsqlite3-dev \
    libncursesw5-dev \
    xz-utils \
    tk-dev \
    libxml2-dev \
    libxmlsec1-dev \
    libffi-dev \
    liblzma-dev \
    # SSH server
    openssh-server \
    # Modern CLI tools
    bat \
    ripgrep \
    fd-find \
    jq \
    # Additional utilities
    less \
    tar \
    gzip \
    unzip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create symlinks for fd (installed as fdfind on Ubuntu)
RUN ln -s $(which fdfind) /usr/local/bin/fd 2>/dev/null || true

# =============================================================================
# Stage 2: User Setup
# =============================================================================

# Create non-root user 'dev' with sudo access
# UID 1000 matches most macOS users for better volume permission handling
RUN useradd -m -s /bin/zsh -u 1000 -G sudo dev && \
    echo "dev ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Switch to dev user for remaining installations
USER dev
WORKDIR /home/dev

# =============================================================================
# Stage 3: Language Runtimes
# =============================================================================

# --- Python (via pyenv) ---
# Install pyenv
RUN curl https://pyenv.run | bash

ENV PYENV_ROOT="/home/dev/.pyenv"
ENV PATH="$PYENV_ROOT/bin:$PATH"

# Install Python 3.12 (latest stable)
# This can take a few minutes on first build
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

# Install gofmt and other Go tools
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
RUN wget https://github.com/neovim/neovim/releases/latest/download/nvim-linux64.tar.gz && \
    tar -C /opt -xzf nvim-linux64.tar.gz && \
    rm nvim-linux64.tar.gz && \
    ln -s /opt/nvim-linux64/bin/nvim /usr/local/bin/nvim

USER dev

# --- Opencode ---
# Install Opencode (Node.js package)
# Pin to specific version for reproducibility
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
    # Allow SSH login for dev user
    echo "AllowUsers dev" >> /etc/ssh/sshd_config && \
    # Disable password authentication (key-based only for security)
    sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config && \
    # Enable pubkey authentication
    sed -i 's/#PubkeyAuthentication yes/PubkeyAuthentication yes/' /etc/ssh/sshd_config && \
    # Disable root login
    sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin no/' /etc/ssh/sshd_config

# Create .ssh directory for dev user (will be populated at runtime)
RUN mkdir -p /home/dev/.ssh && \
    chown -R dev:dev /home/dev/.ssh && \
    chmod 700 /home/dev/.ssh

# =============================================================================
# Stage 6: Dotfiles Setup
# =============================================================================

USER dev

# Clone dotfiles repository
# This will be re-pulled at container startup to get latest changes
ARG DOTFILES_REPO="https://github.com/jdwork/Dotfiles.git"
RUN git clone ${DOTFILES_REPO} /home/dev/Dotfiles

# Create projects directory
RUN mkdir -p /home/dev/projects

# Copy setup scripts
COPY --chown=dev:dev scripts/setup-dotfiles.sh /home/dev/scripts/setup-dotfiles.sh
COPY --chown=dev:dev scripts/entrypoint.sh /home/dev/scripts/entrypoint.sh
RUN chmod +x /home/dev/scripts/*.sh

# Run initial dotfiles setup
# Note: We skip cupertino MCP server as it's not available in container
RUN /home/dev/scripts/setup-dotfiles.sh

# =============================================================================
# Stage 7: Runtime Configuration
# =============================================================================

# Expose SSH port
EXPOSE 22

# Set default shell
ENV SHELL=/bin/zsh

# Health check to ensure SSH is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD pgrep sshd || exit 1

# Switch to root for entrypoint (needs to start sshd)
USER root

# Use entrypoint script to handle startup
ENTRYPOINT ["/home/dev/scripts/entrypoint.sh"]

# Default command: keep container running and drop into shell if exec'd
CMD ["/bin/zsh"]
