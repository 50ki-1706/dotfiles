# .dotfiles

このリポジトリには、`opencode` の設定一式と、`git` の ignore 設定をローカル環境へ配置するためのスクリプト、および環境全体を Nix + Home Manager で管理するための flake が入っています。

## 1. Nix のインストール

Nix がインストールされていない場合:

```sh
sh <(curl -L https://nixos.org/nix/install)
```

## 2. Home Manager でパッケージを導入

```sh
nix run home-manager -- switch --flake .#koki
```

これにより `git`、`openssh`、`mise` が導入され、`~/.ssh/config` の `github.com` ホストブロックも設定されます。

## 3. SSH キーの生成

```sh
nix run .#ssh-bootstrap -- --email "you@example.com"
```

これにより:

- `~/.ssh/id_ed25519` が存在しない場合に作成
- macOS の場合はキーチェーンへ登録

## 4. 公開鍵の登録と接続確認

表示された公開鍵を GitHub またはサーバーに登録後、接続確認:

```sh
ssh -T git@github.com
```

## 5. dotfiles の配置（install.sh）

リポジトリのルートで `install.sh` を実行すると、`opencode/` 配下の設定ファイルが `~/.config/opencode/` に symlink されます。

```bash
./install.sh
```

`install.sh` は次のファイルを配置します。

- `opencode/AGENTS.md` -> `~/.config/opencode/AGENTS.md`
- `opencode/opencode.json` -> `~/.config/opencode/opencode.json`
- `git/ignore` -> `~/.config/git/ignore`

また、`git config --global core.excludesfile` を設定します。macOS・Ubuntu 両対応です。既存ファイルがある場合は、symlink が同じならそのまま、別内容ならバックアップを作成してから置き換えます。

## 関連ファイル

- [install.sh](install.sh)
- [opencode/README.md](opencode/README.md)
