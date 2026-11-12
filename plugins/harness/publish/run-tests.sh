#!/usr/bin/env bash
# Build and test the publish plugin.
#
# The core tests need only git and git-surgeon. The adapter tests mount the
# running dsh installation's own packages, which the link step supplies from
# DSH_INSTALL_MODULES (default: the nix store path of the installed dsh).
#
# The sources are TypeScript compiled to dist/ by `tsrs` (a Rust port of tsc),
# because dsh installs profile plugins under node_modules where Node refuses to
# strip types. Set TSRS to the compiler binary when it is not on PATH.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tsrs="${TSRS:-tsrs}"

if [[ -z "${DSH_INSTALL_MODULES:-}" ]]; then
  dsh_bin="$(command -v dsh || true)"
  if [[ -z "$dsh_bin" ]]; then
    echo "run-tests: dsh is not on PATH; set DSH_INSTALL_MODULES to its node_modules" >&2
    exit 1
  fi
  DSH_INSTALL_MODULES="$(dirname "$(dirname "$(readlink -f "$dsh_bin")")")/libexec/dsh/node_modules"
  export DSH_INSTALL_MODULES
fi

if command -v "$tsrs" >/dev/null 2>&1; then
  # The typecheck resolves the dsh packages and @types/node from node_modules,
  # which the link step creates. Link once up front so the build sees them.
  node --import "$here/tests/link-dsh-modules.ts" -e '0'
  trap 'rm -rf "$here/node_modules"' EXIT
  echo "run-tests: building with $tsrs"
  "$tsrs" -p "$here/tsconfig.json"
else
  echo "run-tests: $tsrs not found; testing the TypeScript sources as-is" >&2
fi

# One file per layer; the glob keeps a new test file from being forgotten.
# Not `exec`: the EXIT trap above has to run after the tests finish.
node --import "$here/tests/link-dsh-modules.ts" --test "$here"/tests/*.test.ts
