#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

. "${REPO_ROOT}/scripts/lib/symlink.sh"
. "${REPO_ROOT}/scripts/lib/accounts.sh"

if ! command -v git >/dev/null 2>&1; then
  echo "エラー: git が見つかりません。先に home-manager switch --flake .#koki を実行してください。" >&2
  exit 1
fi

CSV_FILE="${REPO_ROOT}/accounts.csv"

echo "== アカウント設定の生成 =="
parse_accounts "$CSV_FILE"

echo ""
echo "== Nix 設定の同期 =="
if command -v nix >/dev/null 2>&1; then
  nix run home-manager -- switch --flake "${REPO_ROOT}#koki"
else
  echo "エラー: nix が見つかりません。先に Nix をインストールしてください。" >&2
  echo "  sh <(curl -L https://nixos.org/nix/install)" >&2
  exit 1
fi

echo ""
echo "== SSH キーの確認 =="
MISSING_KEYS=()

DEFAULT_KEY="${HOME}/.ssh/id_ed25519"

if [[ -f "${DEFAULT_KEY}" ]]; then
  echo "OK: ${DEFAULT_KEY}"
else
  echo "未作成: ${DEFAULT_KEY}"
  MISSING_KEYS+=("default")
fi

if [[ ${#MISSING_KEYS[@]} -gt 0 ]]; then
  echo ""
  echo "以下の SSH キーが未作成です:"
  for key in "${MISSING_KEYS[@]}"; do
    case "${key}" in
      default)
        echo "  nix run .#ssh-bootstrap -- --email \"your-email@example.com\""
        ;;
    esac
  done
  echo ""
  echo "作成後、公開後、公開鍵を対応する GitHub アカウントに登録してください。"
fi

echo ""
echo "== opencode 設定の配置 =="
SOURCE_DIR="${REPO_ROOT}/opencode"
TARGET_DIR="${HOME}/.config/opencode"

mkdir -p "${TARGET_DIR}"

link_file_to "AGENTS.md" "${SOURCE_DIR}" "${TARGET_DIR}"
link_file_to "opencode.json" "${SOURCE_DIR}" "${TARGET_DIR}"
link_dir_to "prompts" "${SOURCE_DIR}" "${TARGET_DIR}"

echo ""
echo "== git global ignore の配置 =="
GIT_SOURCE_DIR="${REPO_ROOT}/git"
GIT_TARGET_DIR="${HOME}/.config/git"

link_file_to "ignore" "${GIT_SOURCE_DIR}" "${GIT_TARGET_DIR}"
echo "core.excludesfile の設定は Nix (home-manager switch) で管理されます。ステップ2の実行で反映されます。"

echo ""
echo "シェルエイリアスは Nix (home-manager switch) で管理されます。"
echo "セットアップが完了しました。"
