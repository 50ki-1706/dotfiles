#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

. "${REPO_ROOT}/scripts/lib/symlink.sh"
. "${REPO_ROOT}/scripts/lib/accounts.sh"

CSV_FILE="${REPO_ROOT}/accounts.csv"

is_interactive() {
  [[ -t 0 && -t 1 ]]
}

prompt_yes_no() {
  local prompt="$1"
  local default="${2:-y}"
  local suffix
  local answer

  if [[ "$default" == "y" ]]; then
    suffix="[Y/n]"
  else
    suffix="[y/N]"
  fi

  if ! is_interactive; then
    [[ "$default" == "y" ]]
    return
  fi

  while true; do
    read -r -p "${prompt} ${suffix} " answer
    answer="${answer:-$default}"
    case "$answer" in
      y | Y | yes | YES) return 0 ;;
      n | N | no | NO) return 1 ;;
      *) echo "y または n で入力してください。" ;;
    esac
  done
}

prompt_required() {
  local prompt="$1"
  local value

  while true; do
    read -r -p "$prompt" value
    if [[ -n "$value" ]]; then
      printf '%s\n' "$value"
      return
    fi
    echo "空ではない値を入力してください。" >&2
  done
}

cleanup_existing_nix_store_volume() {
  local diskutil_info
  local device_identifier
  local volume_name
  local mount_point

  [[ "$(uname -s)" == "Darwin" ]] || return
  command -v diskutil >/dev/null 2>&1 || return

  if ! mount | grep -Eq ' on /nix \(apfs,'; then
    return
  fi

  if ! diskutil_info="$(diskutil info /nix 2>/dev/null)"; then
    echo "警告: /nix のディスク情報を確認できませんでした。既存ボリュームの削除をスキップします。" >&2
    return
  fi

  device_identifier="$(printf '%s\n' "$diskutil_info" | awk -F': *' '/^[[:space:]]*Device Identifier:/ { print $2; exit }')"
  volume_name="$(printf '%s\n' "$diskutil_info" | awk -F': *' '/^[[:space:]]*Volume Name:/ { print $2; exit }')"
  mount_point="$(printf '%s\n' "$diskutil_info" | awk -F': *' '/^[[:space:]]*Mount Point:/ { print $2; exit }')"

  if [[ -z "$device_identifier" || "$volume_name" != "Nix Store" || "$mount_point" != "/nix" ]]; then
    echo "警告: /nix はマウントされていますが、Nix Store ボリュームとして確認できませんでした。" >&2
    echo "必要であれば手動で確認してください: diskutil info /nix" >&2
    return
  fi

  echo ""
  echo "既存の Nix Store ボリュームが見つかりました: ${device_identifier} (${mount_point})"
  if prompt_yes_no "Nix の再インストール前にこのボリュームを削除しますか?" "y"; then
    diskutil apfs deleteVolume "$device_identifier"
  else
    echo "既存の Nix Store ボリュームを残したまま続行します。"
  fi
}

ensure_nix() {
  echo "== Nix の確認 =="

  if command -v nix >/dev/null 2>&1; then
    echo "OK: nix が見つかりました。"
    return
  fi

  echo "nix が見つかりません。"
  if ! is_interactive; then
    echo "エラー: 非対話環境では Nix を自動インストールしません。" >&2
    echo "対話シェルで scripts/install.sh を再実行してください。" >&2
    exit 1
  fi

  cleanup_existing_nix_store_volume

  if prompt_yes_no "Nix 公式インストーラを実行しますか?" "y"; then
    sh <(curl -L https://nixos.org/nix/install)
  else
    echo "Nix が必要なため終了します。" >&2
    exit 1
  fi

  if [[ -f /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh ]]; then
    # shellcheck disable=SC1091
    . /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh
  elif [[ -f "${HOME}/.nix-profile/etc/profile.d/nix.sh" ]]; then
    # shellcheck disable=SC1091
    . "${HOME}/.nix-profile/etc/profile.d/nix.sh"
  fi

  if ! command -v nix >/dev/null 2>&1; then
    echo "Nix のインストール後に nix コマンドを見つけられませんでした。" >&2
    echo "新しいシェルを開いてから scripts/install.sh を再実行してください。" >&2
    exit 1
  fi
}

valid_account_dir() {
  [[ "$1" =~ ^[a-zA-Z0-9_-]+$ ]]
}

write_accounts_interactive() {
  local tmp_file="${CSV_FILE}.new"
  local default_name
  local default_email
  local name
  local email
  local dir
  local seen_dirs="|"

  if ! is_interactive; then
    if [[ -f "$CSV_FILE" ]]; then
      echo "非対話環境のため、既存の accounts.csv を使用します。"
    else
      echo "非対話環境で accounts.csv がないため、アカウント設定をスキップします。"
    fi
    return
  fi

  if [[ -f "$CSV_FILE" ]]; then
    if prompt_yes_no "既存の accounts.csv を使用しますか?" "y"; then
      return
    fi
  elif ! prompt_yes_no "Git/GitHub アカウント設定を対話入力しますか?" "y"; then
    return
  fi

  echo ""
  echo "デフォルト Git/GitHub アカウントを入力してください。"
  default_name="$(prompt_required "名前: ")"
  default_email="$(prompt_required "メールアドレス: ")"

  printf '%s,%s\n' "$default_name" "$default_email" > "$tmp_file"

  while prompt_yes_no "追加の GitHub アカウントを登録しますか?" "n"; do
    echo "追加アカウントを入力してください。"
    name="$(prompt_required "名前: ")"
    email="$(prompt_required "メールアドレス: ")"

    while true; do
      dir="$(prompt_required "作業ディレクトリ名 (例: work): ")"
      if ! valid_account_dir "$dir"; then
        echo "ディレクトリ名は英数字、ハイフン、アンダースコアのみ使用できます。"
      elif [[ "$seen_dirs" == *"|$dir|"* ]]; then
        echo "同じディレクトリ名は複数回使えません。"
      else
        seen_dirs+="${dir}|"
        break
      fi
    done

    printf '%s,%s,%s\n' "$name" "$email" "$dir" >> "$tmp_file"
  done

  mv "$tmp_file" "$CSV_FILE"
  echo "作成: $CSV_FILE"
}

default_account_email() {
  local line
  local email

  [[ -f "$CSV_FILE" ]] || return 1

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -z "$line" || "$line" =~ ^# ]] && continue
    email="$(printf '%s' "$line" | cut -d',' -f2 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    [[ -n "$email" ]] || return 1
    printf '%s\n' "$email"
    return 0
  done < "$CSV_FILE"

  return 1
}

ensure_default_ssh_key() {
  local default_key="${HOME}/.ssh/id_ed25519"
  local email="${1:-}"

  echo ""
  echo "== デフォルト SSH キーの確認 =="

  if [[ -f "$default_key" ]]; then
    echo "OK: $default_key"
    return
  fi

  echo "未作成: $default_key"
  if ! is_interactive; then
    echo "非対話環境のため、デフォルト SSH キーの作成をスキップします。"
    return
  fi

  if [[ -z "$email" ]]; then
    email="$(prompt_required "SSH キーに設定するメールアドレス: ")"
  fi

  if prompt_yes_no "デフォルト SSH キーを作成しますか?" "y"; then
    nix run "${REPO_ROOT}#ssh-bootstrap" -- --email "$email"
  fi
}

ensure_nix

echo ""
echo "== アカウント設定の準備 =="
write_accounts_interactive

DEFAULT_EMAIL="$(default_account_email || true)"
ensure_default_ssh_key "$DEFAULT_EMAIL"

echo ""
echo "== アカウント設定の生成 =="
parse_accounts "$CSV_FILE"

echo ""
echo "== Nix 設定の同期 =="
nix run home-manager -- switch --flake "${REPO_ROOT}#koki"

echo ""
echo "opencode 本体と設定は Nix (home-manager switch) で管理されます。"

echo ""
echo "== git global ignore の配置 =="
GIT_SOURCE_DIR="${REPO_ROOT}/git"
GIT_TARGET_DIR="${HOME}/.config/git"

link_file_to "ignore" "${GIT_SOURCE_DIR}" "${GIT_TARGET_DIR}"
echo "core.excludesfile の設定は Nix (home-manager switch) で管理されます。"

echo ""
echo "シェルエイリアスは Nix (home-manager switch) で管理されます。"
echo ""
echo "公開鍵を GitHub の Settings > SSH and GPG keys に登録してください。"
echo "デフォルト鍵: cat ~/.ssh/id_ed25519.pub"
echo "追加アカウント鍵: cat ~/.ssh/id_ed25519_<dir>.pub"
echo "セットアップが完了しました。"
