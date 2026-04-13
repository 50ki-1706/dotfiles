#!/usr/bin/env bash

set -euo pipefail

if ! command -v git >/dev/null 2>&1; then
  echo "エラー: git が見つかりません。先に home-manager switch --flake .#koki を実行してください。" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="${SCRIPT_DIR}/opencode"
TARGET_DIR="${HOME}/.config/opencode"
GIT_SOURCE_DIR="${SCRIPT_DIR}/git"
GIT_TARGET_DIR="${HOME}/.config/git"
SHELL_SOURCE_DIR="${SCRIPT_DIR}/shell"
SHELL_TARGET_DIR="${HOME}/.config/shell"


mkdir -p "${TARGET_DIR}"
mkdir -p "${GIT_TARGET_DIR}"

link_file_to() {
  local name="$1"
  local source_dir="$2"
  local target_dir="$3"
  local dest_name="${4:-$1}"
  local src="${source_dir}/${name}"
  local dst="${target_dir}/${dest_name}"

  mkdir -p "${target_dir}"

  if [[ ! -f "${src}" ]]; then
    echo "エラー: 元ファイルが見つかりません: ${src}" >&2
    exit 1
  fi

  if [[ -L "${dst}" ]]; then
    if [[ "$(readlink "${dst}")" == "${src}" ]]; then
      echo "既に設定済み: ${dst}"
      return
    fi
    local old_target
    old_target="$(readlink "${dst}")"
    rm "${dst}"
    echo "旧シンリンクを削除: ${dst} -> ${old_target} (復旧: ln -s \"${old_target}\" \"${dst}\")"
  elif [[ -e "${dst}" ]]; then
    local backup="${dst}.bak.$(date +%Y%m%d%H%M%S)"
    mv "${dst}" "${backup}"
    echo "既存ファイルを退避: ${backup}"
  fi

  ln -s "${src}" "${dst}"
  echo "作成: ${dst} -> ${src}"
}

link_file_to "AGENTS.md" "${SOURCE_DIR}" "${TARGET_DIR}"
link_file_to "opencode.json" "${SOURCE_DIR}" "${TARGET_DIR}"

link_git_ignore_and_configure() {
  link_file_to "ignore" "${GIT_SOURCE_DIR}" "${GIT_TARGET_DIR}"

  local previous_value
  previous_value="$(git config --global --get core.excludesfile 2>/dev/null || true)"
  if [[ -n "${previous_value}" && "${previous_value}" != "${GIT_TARGET_DIR}/ignore" ]]; then
    echo "バックアップ: core.excludesfile の既存値 (global)=${previous_value}"
    echo "復旧コマンド: git config --global core.excludesfile \"${previous_value}\""
  elif [[ -z "${previous_value}" ]]; then
    echo "バックアップ: core.excludesfile は未設定 (global)"
    echo "復旧コマンド: git config --global --unset core.excludesfile"
  fi

  git config --global core.excludesfile "${GIT_TARGET_DIR}/ignore"

  local configured
  configured="$(git config --global --get core.excludesfile)"
  if [[ "${configured}" != "${GIT_TARGET_DIR}/ignore" ]]; then
    echo "エラー: core.excludesfile の設定確認に失敗しました。" >&2
    exit 1
  fi
  echo "確認: git config --global --get core.excludesfile => ${configured}"
}

link_git_ignore_and_configure

link_file_to "aliases" "${SHELL_SOURCE_DIR}" "${SHELL_TARGET_DIR}"

echo ""
echo "シェルエイリアスを有効にするには、以下をシェル設定ファイルに追記してください:"
echo "  source ~/.config/shell/aliases"
echo ""
echo "追記先:"
echo "  - macOS bash:  ~/.bash_profile"
echo "  - Linux bash:  ~/.bashrc"
echo "  - zsh:         ~/.zshrc"
echo ""
echo "インストールが完了しました。"
