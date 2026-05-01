# This file is intended to be sourced, not executed directly.

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
