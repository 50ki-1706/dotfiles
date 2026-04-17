# .dotfiles

このリポジトリは、git,opencode,mise,ollama等の環境設定ファイルを管理するための dotfiles。

## 初回セットアップ

### 1. Nix のインストール

Nix がインストールされていない場合:

```sh
sh <(curl -L https://nixos.org/nix/install)
```

### 2. リポジトリの clone

Nix を使って一時的に `git` をインストールし、リポジトリを clone します:

```sh
nix shell nixpkgs#git --command git clone https://github.com/koki/dotfiles.git ~/.dotfiles
cd ~/.dotfiles
```

### 3. Home Manager でパッケージを導入

```sh
nix run home-manager -- switch --flake .#koki
```

これにより `git`、`openssh`、`mise` が導入され、`~/.ssh/config` の `github.com` ホストブロックも設定されます。

### 4. SSH キーの生成

```sh
nix run .#ssh-bootstrap -- --email "you@example.com"
```

これにより:

- `~/.ssh/id_ed25519` が存在しない場合に作成
- macOS の場合はキーチェーンへ登録

### 5. 公開鍵の登録と接続確認

生成された公開鍵を GitHub に登録します:

```sh
cat ~/.ssh/id_ed25519.pub
```

上記で表示された公開鍵をコピーし、GitHub の **Settings > SSH and GPG keys > New SSH key** に登録してください。

登録後、接続確認:

```sh
ssh -T git@github.com
```

### 6. dotfiles の配置（install.sh）

リポジトリのルートで `install.sh` を実行すると、各設定ファイルが配置されます。

```bash
./install.sh
```

`install.sh` は以下の処理を順番に実行します。

1. **アカウント設定の生成**（accounts.csv がある場合）
   - `~/Dev/{DIR}/`: 各アカウントの作業ディレクトリ（自動作成）
   - `~/.config/git/accounts.include`: Git設定のincludeIf
   - `~/.config/git/accounts/{DIR}.gitconfig`: 各アカウントのGit設定（`[user]` と `[core] sshCommand` を含む）
   - `~/.ssh/id_ed25519_{DIR}`: SSH鍵（存在しない場合は自動作成し、公開鍵を出力）
   - accounts.csv がない場合、既存の生成済み設定をクリア

2. **Nix 設定の同期**
   - `nix run home-manager -- switch --flake .#koki`

3. **SSH キーの存在チェック**
   - 不足している場合は作成方法を案内

4. **opencode 設定のシンボリックリンク**
   - `opencode/AGENTS.md` -> `~/.config/opencode/AGENTS.md`
   - `opencode/opencode.json` -> `~/.config/opencode/opencode.json`

5. **git global ignore の設定**
   - `git/ignore` -> `~/.config/git/ignore`
   - `core.excludesfile` の値は Nix（`home/default.nix` の `programs.git.settings`）で管理

6. **シェルエイリアスのシンボリックリンク**
   - `shell/aliases` -> `~/.config/shell/aliases`

## 追加アカウントの設定（任意）

複数のGitHubアカウントを切り替える場合は、`accounts.csv`ファイルを作成してください。

### フォーマット

```
使いたい名前,メールアドレス
追加アカウント名,メールアドレス,ディレクトリ名
```

- ヘッダなし
- カンマ区切り
- 1行目: デフォルトアカウント（名前,メールアドレスの2項目）
- 2行目以降: 追加アカウント（名前,メールアドレス,ディレクトリ名の3項目）
- ディレクトリ名は英数字、ハイフン、アンダースコアのみ

### 例

```
Koki Okada,koki.okada@example.com
Koki Okada,koki@work.com,work
```

### 設定手順

1. `accounts.csv.example`をコピーして`accounts.csv`を作成

```sh
cp accounts.csv.example accounts.csv
```

2. 自分のアカウント情報に書き換える

3. `install.sh` を再実行

```sh
./install.sh
```

`install.sh` が自動的に以下を処理します：
- 作業ディレクトリ（`~/Dev/{DIR}/`）の作成
- SSH鍵（`~/.ssh/id_ed25519_{DIR}`）の作成と公開鍵の出力
- Git設定の生成（`[user]` と `[core] sshCommand` を含む）
- 旧方式の `~/.ssh/config.d/accounts` が存在する場合は自動削除

4. 出力された公開鍵を対応するGitHubアカウントに登録

5. 追加アカウントのリポジトリをclone

```sh
agclone <dir> <url>
# 例:
agclone work git@github.com:org/repo.git
```

`agclone` はSSH鍵を指定してcloneし、リポジトリを `~/Dev/<dir>/` 配下に配置します。

### SSH鍵の切り替え仕組み

追加アカウントのSSH鍵切り替えは `includeIf gitdir` + `core.sshCommand` で実現しています。

- `~/Dev/{dir}/` 配下のGitリポジトリでは、`includeIf` により `[user]` と `[core] sshCommand` が自動で切り替わります
- デフォルトアカウントのリポジトリでは `~/.ssh/id_ed25519` が使われます
- `agclone` は初回clone時のみ必要です。clone後は `includeIf` が自動で鍵を切り替えます
- 既存のリポジトリはcloneし直す必要はありません。`~/Dev/{dir}/` 配下にあれば次回の `git` 実行時から自動で切り替わります

> [!NOTE]
> `ssh -T git@github.com` はディレクトリに関係なく、常にSSHのデフォルト鍵で接続します。
> `core.sshCommand` は Git コマンドが内部で呼び出す SSH にのみ適用されるため、鍵切り替えの確認は `git push` や `git ls-remote` などの Git 経由で行ってください。
> SSH コマンド単体で特定鍵を確認したい場合は、`ssh -i ~/.ssh/id_ed25519_<dir> -o IdentitiesOnly=yes -T git@github.com` を使用してください。

### 補足（includeIf の挙動について）

`includeIf gitdir:~/Dev/{dir}/` は、Git リポジトリの作業ディレクトリがそのパスに含まれているときにだけ設定を切り替えます。
単にディレクトリに `cd` しただけでは切り替わらず、対象ディレクトリ内で `git init` または `git clone` して初めて有効になります。

```sh
# 例: work アカウントの切り替えを確認する
cd ~/Dev/work/repo
git config user.name   # → 追加アカウントの名前
git config user.email  # → 追加アカウントのメール
git config core.sshCommand  # → ssh -i ~/.ssh/id_ed25519_work -o IdentitiesOnly=yes
```

## 関連ファイル

- [install.sh](install.sh)
- [accounts.csv.example](accounts.csv.example)
- [opencode/README.md](opencode/README.md)
