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
//   - Push to main branch (enforced here AND by GitHub branch protection)
//   - Access other repositories
//   - Delete critical files
//   - Execute destructive commands
//   - Access internal network addresses
// =============================================================================

// -----------------------------------------------------------------------------
// PERMIT: Repository Operations (Dotfiles only)
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
// FORBID: Dangerous Git Operations
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
    resource.path like "/home/dev/.env*"
};

// -----------------------------------------------------------------------------
// FORBID: Dangerous File Operations
// -----------------------------------------------------------------------------

// NEVER allow deleting protected files
forbid(
    principal == DevContainer::Agent::"openclaw-agent",
    action == DevContainer::Action::"file_delete",
    resource
)
when {
    resource.path like "*.cedar" ||
    resource.path like "*/.git/*" ||
    resource.path like "*/entrypoint.sh" ||
    resource.path like "/home/dev/.ssh/*" ||
    resource.path like "/home/dev/.env*"
};

// -----------------------------------------------------------------------------
// PERMIT: Tool Execution (safe development tools)
// -----------------------------------------------------------------------------

// Allow safe development tools
permit(
    principal == DevContainer::Agent::"openclaw-agent",
    action == DevContainer::Action::"execute_command",
    resource
)
when {
    resource.name in [
        "git",
        "npm",
        "npx",
        "node",
        "python",
        "pip",
        "go",
        "nvim",
        "vim",
        "cat",
        "ls",
        "grep",
        "rg",
        "find",
        "fd",
        "stow",
        "jq",
        "curl",
        "wget",
        "opencode"
    ]
};

// -----------------------------------------------------------------------------
// FORBID: Dangerous Commands
// -----------------------------------------------------------------------------

// NEVER allow destructive or privileged commands
forbid(
    principal == DevContainer::Agent::"openclaw-agent",
    action == DevContainer::Action::"execute_command",
    resource
)
when {
    resource.name in [
        "sudo",
        "su",
        "rm",
        "chmod",
        "chown",
        "kill",
        "pkill",
        "killall",
        "shutdown",
        "reboot",
        "systemctl",
        "docker",
        "podman"
    ]
};

// -----------------------------------------------------------------------------
// PERMIT: Network Access (allowlisted hosts)
// -----------------------------------------------------------------------------

// Allow network access to development-related services
permit(
    principal == DevContainer::Agent::"openclaw-agent",
    action == DevContainer::Action::"network_request",
    resource
)
when {
    resource.host in [
        "github.com",
        "api.github.com",
        "api.anthropic.com",
        "api.openai.com",
        "api.tavily.com",
        "registry.npmjs.org",
        "pypi.org",
        "files.pythonhosted.org",
        "proxy.golang.org"
    ]
};

// -----------------------------------------------------------------------------
// FORBID: Internal Network Access
// -----------------------------------------------------------------------------

// NEVER allow access to internal/private IPs
forbid(
    principal == DevContainer::Agent::"openclaw-agent",
    action == DevContainer::Action::"network_request",
    resource
)
when {
    resource.host like "localhost" ||
    resource.host like "127.*" ||
    resource.host like "10.*" ||
    resource.host like "192.168.*" ||
    resource.host like "172.16.*" ||
    resource.host like "172.17.*" ||
    resource.host like "172.18.*" ||
    resource.host like "172.19.*" ||
    resource.host like "172.2*" ||
    resource.host like "172.30.*" ||
    resource.host like "172.31.*"
};
