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
    rm -rf "$HOME/.config/git/accounts"
    mkdir -p "$HOME/.config/git"
    : > "$HOME/.config/git/accounts.include"
    rm -f "$HOME/.ssh/config.d/accounts"
    # 生成途中の一時ファイルもクリア
    rm -rf "$HOME/.config/git/accounts.new"
    rm -f "$HOME/.config/git/accounts.include.new"
    rm -f "$HOME/.ssh/config.d/accounts.new"
    echo "既存のアカウント設定をクリアしました。"
}

parse_accounts() {
    local csv_file="$1"
    local git_accounts_tmp="$HOME/.config/git/accounts.new"
    local git_include_tmp="$HOME/.config/git/accounts.include.new"

    if [[ ! -f "$csv_file" ]]; then
        echo "accounts.csv が見つかりません。"
        clear_account_settings
        return 0
    fi

    # 空ファイル時は既存設定を削除して終了
    if [[ ! -s "$csv_file" ]]; then
        echo "accounts.csv が空です。既存設定を削除します。"
        clear_account_settings
        return 0
    fi

    # 一時生成先の親ディレクトリのみ作成（既存設定はまだ消さない）
    mkdir -p "$HOME/.config/git"

    # 前回失敗時の一時生成物を削除
    rm -rf "$git_accounts_tmp"
    rm -f "$git_include_tmp"

    mkdir -p "$git_accounts_tmp"
    : > "$git_include_tmp"

    local account_count=0
    local line_no=0
    local has_valid_account=false
    local is_first_account=true
    local seen_dirs="|"

    while IFS= read -r line || [[ -n "$line" ]]; do
        ((line_no++))

        local trimmed="$line"
        trimmed="${trimmed#"${trimmed%%[![:space:]]*}"}"
        trimmed="${trimmed%"${trimmed##*[![:space:]]}"}"

        # 空行とコメント行をスキップ
        [[ -z "$trimmed" || "$trimmed" =~ ^# ]] && continue

        has_valid_account=true

        # CSVカラム数チェック（厳密にカンマ数で判定）
        local comma_only="${trimmed//[^,]/}"
        local comma_count=${#comma_only}

        local name
        local email
        local dir
        local is_default

        if [[ "$is_first_account" == true ]]; then
            if [[ "$comma_count" -ne 1 ]]; then
                echo "エラー: ${line_no}行目はデフォルトアカウントとして name,email の2項目が必要です。" >&2
                rm -rf "$git_accounts_tmp"
                rm -f "$git_include_tmp"
                return 1
            fi
            name="$(printf '%s' "$trimmed" | cut -d',' -f1 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
            email="$(printf '%s' "$trimmed" | cut -d',' -f2 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
            dir=""
            is_default=true
            is_first_account=false
        else
            if [[ "$comma_count" -ne 2 ]]; then
                echo "エラー: ${line_no}行目は追加アカウントとして name,email,dir の3項目が必要です。" >&2
                rm -rf "$git_accounts_tmp"
                rm -f "$git_include_tmp"
                return 1
            fi
            name="$(printf '%s' "$trimmed" | cut -d',' -f1 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
            email="$(printf '%s' "$trimmed" | cut -d',' -f2 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
            dir="$(printf '%s' "$trimmed" | cut -d',' -f3 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
            is_default=false
        fi

        # name/email は必須
        if [[ -z "$name" || -z "$email" ]]; then
            echo "エラー: ${line_no}行目の name または email が空です。" >&2
            rm -rf "$git_accounts_tmp"
            rm -f "$git_include_tmp"
            return 1
        fi

        if [[ "$is_default" == false ]]; then
            # 追加アカウントの dir は必須・形式制約あり・重複不可
            if [[ -z "$dir" ]] || [[ ! "$dir" =~ ^[a-zA-Z0-9_-]+$ ]]; then
                echo "エラー: ${line_no}行目の dir が不正です（許可: 英数字/アンダースコア/ハイフン）。" >&2
                rm -rf "$git_accounts_tmp"
                rm -f "$git_include_tmp"
                return 1
            fi
            if [[ "$seen_dirs" == *"|$dir|"* ]]; then
                echo "エラー: ${line_no}行目の dir '${dir}' が重複しています。" >&2
                rm -rf "$git_accounts_tmp"
                rm -f "$git_include_tmp"
                return 1
            fi
            seen_dirs+="${dir}|"

            # 作業ディレクトリを作成（既存仕様を維持）
            mkdir -p "$HOME/Dev/$dir"
        fi

        # gitconfig生成（デフォルト or 追加アカウント）
        generate_gitconfig "$name" "$email" "$dir" "$is_default" "$git_accounts_tmp" "$git_include_tmp"

        if [[ "$is_default" == false ]]; then
            # 追加アカウントのみ SSH 鍵を生成
            check_and_create_ssh_key "$email" "$dir"
        fi

        ((account_count++))
    done < "$csv_file"

    # コメント/空行のみの場合は空扱いとして全削除
    if [[ "$has_valid_account" == false ]]; then
        echo "accounts.csv に有効なアカウント行がありません。既存設定を削除します。"
        clear_account_settings
        return 0
    fi

    # 原子的置換: 既存を消してから new を本番名へリネーム
    rm -rf "$HOME/.config/git/accounts"
    rm -f "$HOME/.config/git/accounts.include"

    if ! mv "$git_accounts_tmp" "$HOME/.config/git/accounts"; then
        echo "エラー: $git_accounts_tmp を $HOME/.config/git/accounts へリネームできませんでした。" >&2
        return 1
    fi
    if ! mv "$git_include_tmp" "$HOME/.config/git/accounts.include"; then
        echo "エラー: $git_include_tmp を $HOME/.config/git/accounts.include へリネームできませんでした。" >&2
        return 1
    fi

    echo "アカウント設定を生成しました: $account_count 件"
}

generate_gitconfig() {
    local name="$1"
    local email="$2"
    local dir="$3"
    local is_default="$4"
    local accounts_dir="$5"
    local include_file="$6"

    if [[ "$is_default" == true ]]; then
        # デフォルトアカウントは無条件 include
        printf '[user]\n    name = %s\n    email = %s\n' "$name" "$email" > "$accounts_dir/default.gitconfig"
        printf '[include]\n    path = ~/.config/git/accounts/default.gitconfig\n' >> "$include_file"
    else
        # 追加アカウントはディレクトリ条件付き include
        printf '[user]\n    name = %s\n    email = %s\n' "$name" "$email" > "$accounts_dir/$dir.gitconfig"
        printf '[core]\n    sshCommand = ssh -i ~/.ssh/id_ed25519_%s -o IdentitiesOnly=yes\n' "$dir" >> "$accounts_dir/$dir.gitconfig"
        printf '[includeIf "gitdir:~/Dev/%s/"]\n    path = ~/.config/git/accounts/%s.gitconfig\n' "$dir" "$dir" >> "$include_file"
    fi
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

# --- 5. git global ignore を symlink ---
echo ""
echo "== git global ignore の配置 =="

GIT_SOURCE_DIR="${SCRIPT_DIR}/git"
GIT_TARGET_DIR="${HOME}/.config/git"

link_git_ignore_and_configure() {
  link_file_to "ignore" "${GIT_SOURCE_DIR}" "${GIT_TARGET_DIR}"
  echo "core.excludesfile の設定は Nix (home-manager switch) で管理されます。ステップ2の実行で反映されます。"
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
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
