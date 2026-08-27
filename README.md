# dotfiles

## 特徴
- Nix、Home Manager、Brewfileによるアプリケーション管理
- SSHキーとGit設定を分離した複数Gitアカウントの管理
- Nixで管理されるユーザー設定（git global ignoreなど）をホームディレクトリにシンボリックリンクで配置
## 使い方

`git clone`またはzipファイルを展開して、ローカルマシンにこのリポジトリを取得します。

### 初期設定

インストールスクリプトを実行して、Nix、Home Manager、Gitアカウントを設定します。

```sh
./scripts/install.sh
```

リポジトリの構造、OpenCodeエージェントハーネス、設定管理の詳細は [docs/USER_GUIDE.md](docs/USER_GUIDE.md) を参照してください。

### Gitアカウント管理

`agc`を使用すると、ディレクトリに応じた適切なSSHキーとGit設定でリポジトリをクローンできます。

```sh
Usage: agc [<dir>] <url> [<path>]
dir: accounts.csv のディレクトリ名（例: work）。省略時はデフォルトアカウント
url: SSH URL（git@... または ssh://... のみ対応）
path: clone先（省略時は ~/Dev/<dir>/<repo名>、dir省略時は ~/Dev/<repo名>）
相対パスはカレントディレクトリ基準で解決後、
clone先ベース配下のみ許可。通常は省略を推奨。
```

リポジトリをクローンした後、通常通り`git`コマンドを使用できます。ディレクトリに応じたSSHキーとGit設定が適用されます。

## 変更適用方法

詳細は [docs/USER_GUIDE.md](docs/USER_GUIDE.md) を参照してください。

```sh
nix run home-manager -- switch --flake .#koki
```

## トラブルシューティング

### nixコマンドが見つからない場合

macOSのアップデートなど、特定のタイミングで、nixで管理するアプリケーションが使用できなくなることがあります。
その場合は、`scripts/install.sh` を再度実行してみてください。NixのインストールとHome Managerの設定が再度適用されます。

## gitアカウントの確認

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
