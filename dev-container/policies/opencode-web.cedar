// =============================================================================
// Cedar Policy: opencode-web
// =============================================================================
// Purpose: Define permissions for the Opencode web-based agent
//
// This is similar to openclaw-agent but may have additional restrictions
// for web-based access patterns (e.g., additional network restrictions,
// more limited file paths).
//
// Permissions:
//   - Clone and pull the Dotfiles repository
//   - Push to feature branches (NOT main)
//   - Read/write files in workspace (more restricted paths)
//   - Execute development tools
//
// Restrictions:
//   - Cannot push to main branch
//   - Cannot access other repositories
//   - More limited file access than openclaw-agent
//   - No access to internal network
// =============================================================================

// -----------------------------------------------------------------------------
// PERMIT: Repository Operations (Dotfiles only)
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
// FORBID: Dangerous Git Operations
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

// -----------------------------------------------------------------------------
// PERMIT: File Operations (restricted to specific directories)
// -----------------------------------------------------------------------------

// More restricted than openclaw-agent - only Dotfiles and projects
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
    resource.path like "/home/dev/.env*" ||
    resource.path like "*/node_modules/*"
};

// -----------------------------------------------------------------------------
// FORBID: Dangerous File Operations
// -----------------------------------------------------------------------------

forbid(
    principal == DevContainer::Agent::"opencode-web",
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

permit(
    principal == DevContainer::Agent::"opencode-web",
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

forbid(
    principal == DevContainer::Agent::"opencode-web",
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

permit(
    principal == DevContainer::Agent::"opencode-web",
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
// FORBID: Internal Network Access (more strict for web)
// -----------------------------------------------------------------------------

forbid(
    principal == DevContainer::Agent::"opencode-web",
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
    resource.host like "172.31.*" ||
    resource.host like "169.254.*"
};
