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
#
# `git status --porcelain` rather than `git diff`: a new dist file that was
# never committed is untracked, and `git diff` does not report untracked files,
# so a forgotten `git add` would slip through.
#
# The paths are listed explicitly: a `*/dist` pathspec is matched relative to
# the repository root, not to `-C`, and `:(glob)*/dist` does not cross `/`, so
# neither reaches these nested directories.
dist_paths=(core/dist dsh-adapter/dist codex-adapter/dist opencode-adapter/dist)
if [[ "${PUBLISH_SKIP_DIST_CHECK:-}" != 1 ]] && git -C "$here" rev-parse --git-dir >/dev/null 2>&1; then
  dist_changes="$(git -C "$here" status --porcelain -- "${dist_paths[@]}")"
  if [[ -n "$dist_changes" ]]; then
    echo "run-tests: dist/ is stale; commit the output of 'npx tsc -b --force'" >&2
    printf '%s\n' "$dist_changes" >&2
    exit 1
  fi
fi

echo "run-tests: core"
node --test "$here"/core/tests/*.test.ts
echo "run-tests: codex adapter"
node --test "$here"/codex-adapter/tests/*.test.ts
echo "run-tests: opencode adapter"
node --test "$here"/opencode-adapter/tests/*.test.ts
echo "run-tests: dsh adapter"
node --import "$here/dsh-adapter/tests/link-dsh-modules.ts" --test "$here"/dsh-adapter/tests/*.test.ts
