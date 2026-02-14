// =============================================================================
// Cedar Policy: dev-full
// =============================================================================
// Purpose: Reference policy for full development access
//
// This policy is primarily for documentation and monitoring purposes.
// The dev-full container has an account key, so GitHub enforces access.
// This policy can be used with Leash for logging/auditing.
//
// Permissions:
//   - All git operations on any repository
//   - All file operations within /home/dev
//   - All command execution
//   - All network access
// =============================================================================

// -----------------------------------------------------------------------------
// PERMIT: Git Operations (all repos, all branches)
// -----------------------------------------------------------------------------

permit(
    principal == DevContainer::Agent::"dev-full",
    action in [
        DevContainer::Action::"git_clone",
        DevContainer::Action::"git_pull",
        DevContainer::Action::"git_push"
    ],
    resource
);

// -----------------------------------------------------------------------------
// PERMIT: File Operations (within home directory)
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// PERMIT: Command Execution (all commands)
// -----------------------------------------------------------------------------

permit(
    principal == DevContainer::Agent::"dev-full",
    action == DevContainer::Action::"execute_command",
    resource
);

// -----------------------------------------------------------------------------
// PERMIT: Network Access (all hosts)
// -----------------------------------------------------------------------------

permit(
    principal == DevContainer::Agent::"dev-full",
    action == DevContainer::Action::"network_request",
    resource
);

// -----------------------------------------------------------------------------
// AUDIT: Log elevated operations (for monitoring)
// -----------------------------------------------------------------------------
// Note: These are permitted but should be logged at elevated level

@annotation("audit_level", "elevated")
permit(
    principal == DevContainer::Agent::"dev-full",
    action == DevContainer::Action::"execute_command",
    resource
)
when {
    resource.name == "sudo" ||
    resource.name == "rm" ||
    resource.name == "chmod"
};
