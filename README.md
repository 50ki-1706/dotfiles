# dotfiles

## What this is / isn’t

macOS の開発環境を Nix で管理する個人用 dotfiles。

## What’s inside

- [シェル・エディタ・ターミナル・CLI の設定](modules/README.md)
- [macOS・アプリの設定](hosts/README.md)
- [複数の Git アカウント・SSH キーの管理](docs/scripts/README.md#git-アカウント管理)
- [OpenCode ハーネス](docs/opencode/README.md)と[エージェント用スキル](skills/README.md)
- [初期設定・移行・検証スクリプト](scripts/README.md)

## Installation

このリポジトリを `~/.dotfiles` に取得し、実行します。

```sh
cd ~/.dotfiles
zsh scripts/install.sh
```

詳しい手順は [初期設定](docs/scripts/README.md#初期設定)、導入後の変更は [設定の適用](docs/home-manager/README.md#設定の適用) を参照してください。その他は [ドキュメント一覧](docs/README.md) にまとめています。
