#!/usr/bin/env bash
# Build and test the publish workspace.
#
# The core and Codex adapter tests need only git and git-surgeon. The DSH
# adapter tests mount the running dsh installation's own packages, which the
# link step supplies from DSH_INSTALL_MODULES (default: the nix store path of
# the installed dsh).
#
# The packages ship JavaScript: dsh installs its bundle under node_modules,
# where Node refuses to strip types. `tsc -b` compiles each package's src/ to
# dist/, and the committed dist/ is what ships.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z "${DSH_INSTALL_MODULES:-}" ]]; then
  dsh_bin="$(command -v dsh || true)"
  if [[ -z "$dsh_bin" ]]; then
    echo "run-tests: dsh is not on PATH; set DSH_INSTALL_MODULES to its node_modules" >&2
    exit 1
  fi
  # Resolve the symlink without `readlink -f`, which is a GNU extension that
  # older macOS and BSD readlink do not implement.
  dsh_bin_dir="$(cd "$(dirname "$dsh_bin")" && pwd -P)"
  DSH_INSTALL_MODULES="$(dirname "$(dirname "$dsh_bin_dir")")/libexec/dsh/node_modules"
  export DSH_INSTALL_MODULES
fi

# npm links the workspace packages into node_modules; the DSH link step adds
# the @deepseek-ai/* packages beside them.
if [[ ! -e "$here/node_modules/@publish/core" ]]; then
  echo "run-tests: installing workspace links"
  (cd "$here" && npm install --no-audit --no-fund --ignore-scripts)
fi
node --import "$here/dsh-adapter/tests/link-dsh-modules.ts" -e '0'

echo "run-tests: building"
(cd "$here" && npx tsc -b --force)

# The packages ship their compiled dist/, so a stale build would ship code that
# does not match src/. Rebuild from scratch and fail if the result differs.
if [[ "${PUBLISH_SKIP_DIST_CHECK:-}" != 1 ]] && git -C "$here" rev-parse --git-dir >/dev/null 2>&1; then
  if ! git -C "$here" diff --quiet -- '*/dist'; then
    echo "run-tests: dist/ is stale; commit the output of 'npx tsc -b --force'" >&2
    git -C "$here" --no-pager diff --stat -- '*/dist' >&2
    exit 1
  fi
fi

echo "run-tests: core"
node --test "$here"/core/tests/*.test.ts
echo "run-tests: codex adapter"
node --test "$here"/codex-adapter/tests/*.test.ts
echo "run-tests: dsh adapter"
node --import "$here/dsh-adapter/tests/link-dsh-modules.ts" --test "$here"/dsh-adapter/tests/*.test.ts
