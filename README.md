# dotfiles

## features
- Manage applications with Nix and Home Manager
- Manage multiple Git accounts with separate SSH keys and Git settings
- user settings (e.g. git global ignore) managed by Nix, symlinked to the home directory
## Usage

`git clone` or Extract the zip file to get this repository on your local machine.

### Initial setup
Run the installation script to set up Nix, Home Manager, and Git accounts.

```sh
./scripts/install.sh
```

In the case of multiple Git accounts, `scripts/install.sh` will prompt you to register additional accounts.

This installation script creates `accounts.csv` in the repository root to manage additional Git accounts. The script uses this file to set up the following:

- `~/Dev/{dir}/`: Additional account's development directory
- `~/.config/git/accounts.include`: Git configuration that includes account-specific settings based on the current directory
- `~/.config/git/accounts/{dir}.gitconfig`: Account-specific Git settings
- `~/.ssh/id_ed25519_{dir}`: SSH keys for additional accountsi

If an existing `accounts.csv` file is present, the script will ask whether to use it as is or create a new one through interactive input.

If you edit `accounts.csv` by hand, follow  `accounts.csv.example` format and make sure to run `./scripts/install.sh` again to apply the changes.

### Git account management

You can use `agc` to clone repositories with the appropriate SSH key and Git settings based on the directory.

```sh
Usage: agc [<dir>] <url> [<path>]
dir: accounts.csv のディレクトリ名（例: work）。省略時はデフォルトアカウント
url: SSH URL（git@... または ssh://... のみ対応）
path: clone先（省略時は ~/Dev/<dir>/<repo名>、dir省略時は ~/Dev/<repo名>）
相対パスはカレントディレクトリ基準で解決後、
clone先ベース配下のみ許可。通常は省略を推奨。
```

After clone ripository, you can use `git` commands as usual. The appropriate SSH key and Git settings will be applied based on the directory.

## 変更適用方法

nixとhome-managerの設定は、リポジトリルートで次のコマンドを実行することで適用されます。

```sh
nix run home-manager -- switch --flake .#koki
```

claude codeやcodex等のAIエージェントでは、`nix-verify` skillにより、フォーマットとビルドを含めた変更の適用を行うようにしています。

aliasなどのsymlinkで管理している設定は、ディレクトリの移動を伴わないものであれば、変更を加えるだけで次回のターミナル起動時に反映されます。

## Troubleshooting

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
