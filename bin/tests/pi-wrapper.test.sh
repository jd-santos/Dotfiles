#!/usr/bin/env bash
set -euo pipefail

if [[ "$OSTYPE" != darwin* ]]; then
  echo 'pi wrapper test skipped (macOS only)'
  exit 0
fi

script="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/bin/pi"
fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT
printf '#!/usr/bin/env bash\nprintf "%%s\\n" "${OP_BIOMETRIC_UNLOCK_ENABLED-unset}"\n' > "$fixture/real-pi"
chmod 700 "$fixture/real-pi"

run_pi() {
  env -u OPENROUTER_API_KEY -u OP_BIOMETRIC_UNLOCK_ENABLED \
    PI_REAL_BIN="$fixture/real-pi" "$@" "$script"
}

[[ "$(run_pi HERDR_ENV=1)" == true ]]
[[ "$(run_pi HERDR_ENV=0)" == unset ]]
[[ "$(run_pi HERDR_ENV=1 OP_BIOMETRIC_UNLOCK_ENABLED=false)" == false ]]
[[ "$(run_pi HERDR_ENV=1 OP_BIOMETRIC_UNLOCK_ENABLED=true)" == true ]]

echo 'pi wrapper Herdr auth tests passed'
