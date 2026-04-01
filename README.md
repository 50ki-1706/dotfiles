# .dotfiles

このリポジトリには、`opencode` の設定一式と、`git` の ignore 設定をローカル環境へ配置するためのスクリプト、および `git` と SSH をブートストラップするための Nix flake が入っています。

## 1. Nix のインストール

Nix がインストールされていない場合:

```sh
sh <(curl -L https://nixos.org/nix/install)
```

## 2. git と openssh のインストール

```sh
nix profile install .#git .#openssh
```

まとめてインストールする場合:

```sh
nix profile install .#default
```

インストールせずに一時的に使う場合:

```sh
nix develop
```

## 3. SSH キーと GitHub 設定の作成

```sh
nix run .#ssh-bootstrap -- --email "you@example.com"
```

これにより:

- `~/.ssh/id_ed25519` が存在しない場合に作成
- macOS の `~/.ssh/config` に `github.com` ホストブロックを追記
- 公開鍵を表示（GitHub への登録用）

## 4. 公開鍵の登録と接続確認

表示された公開鍵を GitHub またはサーバーに登録後、接続確認:

```sh
ssh -T git@github.com
```

## 5. dotfiles の配置（install.sh）

Ubuntu 24.04 では、リポジトリのルートで `install.sh` を実行すると、`opencode/` 配下の設定ファイルが `~/.config/opencode/` に symlink されます。

```bash
./install.sh
```

`install.sh` は次のファイルを配置します。

- `opencode/AGENTS.md` -> `~/.config/opencode/AGENTS.md`
- `opencode/opencode.json` -> `~/.config/opencode/opencode.json`
- `git/ignore` -> `~/.config/git/ignore`

また、`git config --global core.excludesfile ~/.config/git/ignore` を実行し、`git config --get core.excludesfile` が `~/.config/git/ignore` になっていることを確認します。異なる場合はエラーとして中止します。

動作条件は Ubuntu 24.04 のみです。既存ファイルがある場合は、symlink が同じならそのまま、別内容ならバックアップを作成してから置き換えます。

## 関連ファイル

- [install.sh](install.sh)
- [opencode/README.md](opencode/README.md)
