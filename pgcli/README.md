# pgcli

PostgreSQL CLI with syntax highlighting, auto-completion, and vi/emacs editor mode.

- Context-aware auto-completion, multi-line queries, destructive warnings
- Colors, table format, and pager preferences configured
- Passwords stored in macOS Keychain/1Password via keyring integration

## Setup

```bash
stow pgcli  # Symlinks config to ~/.config/pgcli/
```

Connect using environment variables or a connection string:

```bash
# Environment variables:
export PGHOST=localhost
export PGPORT=5432
export PGUSER=myuser
export PGDATABASE=mydb
pgcli

# Connection string:
pgcli postgresql://localhost/mydb
```

## Environment Variables

- `PGHOST` - Database host (default: localhost)
- `PGPORT` - Database port (default: 5432)
- `PGUSER` - Username
- `PGDATABASE` - Database name
- `PGPASSWORD` - Password (or use keyring for secure storage)
