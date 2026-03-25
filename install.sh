#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="${SCRIPT_DIR}/opencode"
TARGET_DIR="${HOME}/.config/opencode"

if [[ ! -r /etc/os-release ]]; then
  echo "エラー: OS 情報を確認できません。" >&2
  exit 1
fi

# Ubuntu 24.04 以外では実行しない
# shellcheck disable=SC1091
source /etc/os-release
if [[ "${ID:-}" != "ubuntu" || "${VERSION_ID:-}" != "24.04" ]]; then
  echo "エラー: Ubuntu 24.04 以外では実行しない想定です。" >&2
  exit 1
fi

mkdir -p "${TARGET_DIR}"

link_file() {
  local name="$1"
  local src="${SOURCE_DIR}/${name}"
  local dst="${TARGET_DIR}/${name}"

  if [[ ! -f "${src}" ]]; then
    echo "エラー: 元ファイルが見つかりません: ${src}" >&2
    exit 1
  fi

  if [[ -L "${dst}" ]]; then
    if [[ "$(readlink "${dst}")" == "${src}" ]]; then
      echo "既に設定済み: ${dst}"
      return
    fi
    rm "${dst}"
  elif [[ -e "${dst}" ]]; then
    local backup="${dst}.bak.$(date +%Y%m%d%H%M%S)"
    mv "${dst}" "${backup}"
    echo "既存ファイルを退避: ${backup}"
  fi

  ln -s "${src}" "${dst}"
  echo "作成: ${dst} -> ${src}"
}

link_file "AGENTS.md"
link_file "opencode.json"

echo "インストールが完了しました。"