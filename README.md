# .dotfiles

MacOS 向けの dotfiles リポジトリです。Nix と Home Manager を使って設定とパッケージを管理しています。

## 初回セットアップ

このリポジトリを clone したあと、リポジトリのルートで `scripts/install.sh` を実行してください。

```sh
./scripts/install.sh
```

`scripts/install.sh` が初回セットアップに必要な処理をまとめて実行します。

1. Nix が未インストールの場合、確認後に Nix 公式インストーラを実行
2. Git/GitHub アカウント設定を対話的に作成
3. デフォルト SSH キーを作成
4. 追加 GitHub アカウント用の作業ディレクトリ、Git 設定、SSH キーを作成
5. Home Manager を `nix run home-manager -- switch --flake .#koki` で実行
6. git global ignore など、Nix 管理外の設定を配置

Nix インストール直後に現在のシェルから `nix` が見つからない場合は、新しいシェルを開いてから同じコマンドを再実行してください。

## リポジトリの取得

Nix がすでにある場合は、次のように一時的に `git` を使って clone できます。

```sh
nix shell nixpkgs#git --command git clone https://github.com/koki/dotfiles.git ~/.dotfiles
cd ~/.dotfiles
./scripts/install.sh
```

Nix がまだない場合は、任意の方法でこのリポジトリを `~/.dotfiles` に配置してから `./scripts/install.sh` を実行してください。Nix のインストール以降はスクリプトが案内します。

## 複数 GitHub アカウント

複数の GitHub アカウントを使う場合は、`scripts/install.sh` の対話入力で追加アカウントを登録してください。スクリプトは `accounts.csv` を生成し、次の設定を作成します。

- `~/Dev/{dir}/`: 追加アカウントの作業ディレクトリ
- `~/.config/git/accounts.include`: Git 設定の includeIf
- `~/.config/git/accounts/{dir}.gitconfig`: アカウント別の Git 設定
- `~/.ssh/id_ed25519_{dir}`: 追加アカウント用の SSH キー

既存の `accounts.csv` がある場合、スクリプト実行時にそのまま使うか、対話入力で作り直すかを選べます。

### accounts.csv の形式

手動で編集する場合は、次の形式にしてください。

```csv
使いたい名前,メールアドレス
追加アカウント名,メールアドレス,ディレクトリ名
```

- ヘッダなし
- 1行目: デフォルトアカウント
- 2行目以降: 追加アカウント
- ディレクトリ名は英数字、ハイフン、アンダースコアのみ

## 公開鍵の登録

`scripts/install.sh` が表示した公開鍵を、対応する GitHub アカウントの **Settings > SSH and GPG keys > New SSH key** に登録してください。

あとから確認する場合:

```sh
cat ~/.ssh/id_ed25519.pub
cat ~/.ssh/id_ed25519_<dir>.pub
```

デフォルトアカウントの接続確認:

```sh
ssh -T git@github.com
```

追加アカウントの SSH コマンド単体での確認:

```sh
ssh -i ~/.ssh/id_ed25519_<dir> -o IdentitiesOnly=yes -T git@github.com
```

> [!NOTE]
> `ssh -T git@github.com` はディレクトリに関係なく、常に SSH のデフォルト鍵で接続します。
> 追加アカウントの鍵切り替えは Git の `includeIf gitdir` と `core.sshCommand` で行うため、実際の切り替え確認は `git push` や `git ls-remote` など Git 経由で行ってください。

## 追加アカウントの clone

追加アカウントのリポジトリを初回 clone するときは `agclone` を使えます。

```sh
agclone <dir> <url>
# 例:
agclone work git@github.com:org/repo.git
```

`agclone` は SSH 鍵を指定して clone し、リポジトリを `~/Dev/<dir>/` 配下に配置します。clone 後は `includeIf` により、対象ディレクトリ内の Git リポジトリで `[user]` と `[core] sshCommand` が自動で切り替わります。
