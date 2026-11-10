# dotfiles

## What this is / isn’t
私の開発環境
### 対象OS
- Mac OS
### 使用端末
- Mac Book Air M5 32gb
## What’s inside
### Editor
- vscode
- helix
### AI Coding
- codex
- claude code
- vibe cli
- dsh
- opencode
### Terminal
- Ghostty
- Herdr
### Tools
- lazygit
- fzf
- git-surgeon
- ripgrep
- yq-go
### develop environments
- devenv
- mise

## Installation

事前に次を用意してください。

- Homebrew。
- Mac App Store へのサインイン。
- [plugins/app/hanon-player/homebrew](plugins/app/hanon-player/homebrew) が参照するローカル tap `/Users/koki/Dev/mywork/eigo-no-hanon/homebrew-tap`。

このリポジトリを `~/.dotfiles` に取得し、対話ターミナルで実行します。Nix が未導入の場合は、スクリプトからインストールできます。

```sh
cd ~/.dotfiles
zsh scripts/install.sh
```
## Apply Changes

Nix が読み込む新規ファイルは、検証前に `git add <ファイル>` で追跡対象にします。コミットは不要で、追跡済みファイルの編集は未ステージでも反映されます。

1. 適用前チェック
```sh
cd /Users/koki/.dotfiles
nix fmt
nix run home-manager -- build --flake .#koki
nix build .#darwinConfigurations.mac.system --out-link result-darwin
```
2. 変更を適用(mainブランチ)
```sh
sudo darwin-rebuild switch --flake /Users/koki/.dotfiles#mac
```
3. アカウントの設定のみ変更したい場合
```sh
zsh -c 'source scripts/lib/accounts.sh; parse_accounts accounts.csv'
```

`accounts.csv` は Git 管理外のまま用意してください。未作成・空・空行やコメントのみの場合、生成済みアカウント設定を削除します（SSH キーは残ります）。
