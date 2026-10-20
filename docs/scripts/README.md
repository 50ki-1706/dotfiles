# 初期設定・Git アカウント管理

## 初期設定

リポジトリを [対象環境](../introduction/README.md) の配置先に取得し、リポジトリルートで実行します。事前に Homebrew を導入し、Mac App Store にサインインしてください。`hosts/mac.nix` のローカル tap が参照する `/Users/koki/Dev/mywork/eigo-no-hanon/homebrew-tap` も必要です。

```sh
zsh scripts/install.sh
```

Nix、Git アカウント、SSH キーを確認し、旧リンクの移行と初回の設定適用を行います。スクリプト一覧は [scripts/](../../scripts/README.md)、適用コマンドは [設定の適用](../home-manager/README.md#設定の適用) を参照してください。

旧 Git ignore・VS Code リンクの移行は、単独でも実行できます。

```sh
zsh scripts/migrate-legacy-links.sh
```

想定外のリンク先、安全でないリンク連鎖、リンク以外のファイルがあると、旧リンクを削除せず中止します。移行に失敗した場合は、初回適用も中止します。

未認識の `/etc/bashrc`・`/etc/zshrc` は、対話時に退避の確認が出ます（既定は「いいえ」）。承認すると `*.before-nix-darwin` に退避され、元のパスは nix-darwin の設定に置き換わります。カスタマイズは退避先に残り、`*.local` は変更しません。非対話時は手動の `sudo mv` コマンドを表示して中止します。

## Git アカウント管理

アカウントは Git 管理外の `accounts.csv` に定義します。形式は [accounts.csv.example](../../accounts.csv.example) を参照してください。初期設定では対話入力または既存ファイルを使い、Git の include 設定と追加アカウントの SSH キーを生成します。

アカウント定義の変更だけを反映する場合は、リポジトリルートで次を実行します。

```sh
zsh -c 'source scripts/lib/accounts.sh; parse_accounts accounts.csv'
```

生成先は `~/.config/git/accounts/` と `~/.config/git/accounts.include` です。Nix はこれらを生成しません。`accounts.csv` が未作成・空・コメントのみの場合は生成済みのアカウント設定を削除します。SSH キーは削除しません。

`agc` で、アカウント別の SSH キーと Git 設定を使ってクローンできます。

```sh
agc [<dir>] <url> [<path>]
```

| 引数 | 指定内容 |
| --- | --- |
| `dir` | `accounts.csv` のディレクトリ名（例: `work`）。省略時はデフォルトアカウント |
| `url` | SSH URL（`git@...` または `ssh://...`） |
| `path` | 保存先。省略時は `~/Dev/<dir>/<repo名>`、`dir` も省略すると `~/Dev/<repo名>` |

`path` は省略を推奨します。相対パスは現在のディレクトリを基準に解決し、クローン先のベースディレクトリ配下だけを指定できます。クローン後は通常の `git` コマンドでも、ディレクトリに応じたアカウント設定が使われます。

## 公開鍵・接続の確認

```sh
cat ~/.ssh/id_ed25519.pub
cat ~/.ssh/id_ed25519_<dir>.pub
```

公開鍵は GitHub の Settings → SSH and GPG keys に登録してください。

```sh
# デフォルトアカウント
ssh -T git@github.com

# 追加アカウントの鍵を指定して確認
ssh -i ~/.ssh/id_ed25519_<dir> -o IdentitiesOnly=yes -T git@github.com
```

`ssh -T git@github.com` はディレクトリに関係なくデフォルト鍵を使います。アカウントの自動切り替えは、対象リポジトリで `git ls-remote` などの Git コマンドを使って確認してください。
