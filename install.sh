#!/usr/bin/env bash

set -euo pipefail

if ! command -v git >/dev/null 2>&1; then
  echo "エラー: git が見つかりません。先に home-manager switch --flake .#koki を実行してください。" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CSV_FILE="${SCRIPT_DIR}/accounts.csv"

# --- 1. CSV読み込みとgitconfig生成 ---
echo "== アカウント設定の生成 =="

clear_account_settings() {
    # 既存のアカウント設定をクリア
    rm -rf "$HOME/.config/git/accounts"
    rm -f "$HOME/.config/git/accounts.include"
    rm -f "$HOME/.ssh/config.d/accounts"
    echo "既存のアカウント設定をクリアしました。"
}

parse_accounts() {
    local csv_file="$1"

    if [[ ! -f "$csv_file" ]]; then
        echo "accounts.csv が見つかりません。"
        clear_account_settings
        return 0
    fi

    # 管理ディレクトリをクリア
    clear_account_settings

    # 管理ディレクトリを作成
    mkdir -p "$HOME/.config/git/accounts"
    mkdir -p "$HOME/.ssh/config.d"

    local account_count=0

    while IFS= read -r line; do
        # 空行とコメント行をスキップ
        [[ -z "$line" || "$line" =~ ^# ]] && continue

        # CSV解析
        local name=$(echo "$line" | cut -d',' -f1 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        local email=$(echo "$line" | cut -d',' -f2 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        local dir=$(echo "$line" | cut -d',' -f3 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

        # バリデーション
        if [[ -z "$dir" ]] || [[ ! "$dir" =~ ^[a-zA-Z0-9_-]+$ ]]; then
            echo "不正なディレクトリ名: $dir。スキップします。"
            continue
        fi

        # 作業ディレクトリを作成
        mkdir -p "$HOME/Dev/$dir"

        # gitconfig生成
        generate_gitconfig "$name" "$email" "$dir"

        # SSH設定生成
        generate_ssh_match "$dir"

        # SSHキーの存在チェックと作成
        check_and_create_ssh_key "$email" "$dir"

        ((account_count++))
    done < "$csv_file"

    echo "アカウント設定を生成しました: $account_count 件"
}

generate_gitconfig() {
    local name="$1"
    local email="$2"
    local dir="$3"

    # アカウント設定ファイルを生成
    printf '[user]\n    name = %s\n    email = %s\n' "$name" "$email" > "$HOME/.config/git/accounts/$dir.gitconfig"

    # accounts.includeに追記
    printf '[includeIf "gitdir:~/Dev/%s/"]\n    path = ~/.config/git/accounts/%s.gitconfig\n' "$dir" "$dir" >> "$HOME/.config/git/accounts.include"
}

generate_ssh_match() {
    local dir="$1"

    # SSH Matchブロックを生成
    printf 'Match host github.com exec "pwd | grep -qE \x27^%s/Dev/%s(/|$)\x27"\n    IdentityFile ~/.ssh/id_ed25519_%s\n' "$HOME" "$dir" "$dir" >> "$HOME/.ssh/config.d/accounts"
}

check_and_create_ssh_key() {
    local email="$1"
    local dir="$2"
    local key_path="$HOME/.ssh/id_ed25519_$dir"

    if [[ -f "$key_path" ]]; then
        echo "OK: $key_path"
    else
        echo "未作成: $key_path"
        ssh-keygen -t ed25519 -C "$email" -f "$key_path" -N ""
        echo "作成: $key_path"
        echo "公開鍵:"
        cat "$key_path.pub"
    fi
}

parse_accounts "$CSV_FILE"

# --- 2. Home Manager で nix 設定を同期 ---
echo ""
echo "== Nix 設定の同期 =="
if command -v nix >/dev/null 2>&1; then
  nix run home-manager -- switch --flake "${SCRIPT_DIR}#koki"
else
  echo "エラー: nix が見つかりません。先に Nix をインストールしてください。" >&2
  echo "  sh <(curl -L https://nixos.org/nix/install)" >&2
  exit 1
fi

# --- 3. SSH キーの存在チェック ---
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

# --- 4. opencode の設定を symlink ---
echo ""
echo "== opencode 設定の配置 =="
SOURCE_DIR="${SCRIPT_DIR}/opencode"
TARGET_DIR="${HOME}/.config/opencode"

mkdir -p "${TARGET_DIR}"

link_file_to() {
  local name="$1"
  local source_dir="$2"
  local target_dir="$3"
  local dest_name="${4:-$1}"
  local src="${source_dir}/${name}"
  local dst="${target_dir}/${dest_name}"

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

# --- 5. git の global ignore を symlink ---
echo ""
echo "== git global ignore の配置 =="

GIT_SOURCE_DIR="${SCRIPT_DIR}/git"
GIT_TARGET_DIR="${HOME}/.config/git"

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

# --- 6. shell/aliases を symlink ---
echo ""
echo "== シェルエイリアスの配置 =="
SHELL_SOURCE_DIR="${SCRIPT_DIR}/shell"
SHELL_TARGET_DIR="${HOME}/.config/shell"

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
echo "セットアップが完了しました。"
