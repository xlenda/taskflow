#!/usr/bin/env bash
# Wrapper Bash. A esteira autoritativa e scripts/deploy-celeste.js.
set -euo pipefail
cd "$(dirname "$0")/.."
exec node scripts/deploy-celeste.js
