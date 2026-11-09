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

## dsh-TUI

[dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI) は `dsh --profile dsh-tui` のプラグインとして導入します。
profile の宣言（`package.json` と `pnpm-lock.yaml`）は [modules/cli/dsh-tui](modules/cli/dsh-tui) にあり、
Nix の適用時に `pnpm install --frozen-lockfile` で依存を展開します。

```sh
dsh --profile dsh-tui
```

## Terminal themes

Nix の適用後は、どのディレクトリからでも手動で切り替えられます。

```sh
cgt light # 現在の Solarized Light
cgt dark  # VS Code 標準の Dark Modern を基にした配色
```

対象は Ghostty・Herdr・Helix・lazygit・OpenCode・Vibe CLI。VS Code 自体の設定は変更しません。
初回適用は light、以降は `~/.local/state/cgt/current` に保存した選択を再適用します。
OS の外観には自動追従しません。

起動中の Ghostty は `Cmd+Shift+,`、Helix は `:config-reload` で読み直します。
Herdr はコマンドから再読み込みを試みます。表示が変わらなければ Herdr の `prefix + Shift+R` を使ってください。
lazygit・OpenCode・Vibe は起動し直してください。プロジェクト別設定や起動時の設定ファイル指定がある場合は、そちらが優先されます。

Ghostty・Herdr・Helix・OpenCode の設定は、既存の各モジュールの設定から Nix が生成し、`current` 経由で参照します。
設定本体を編集した場合は Nix の再ビルド・適用が必要です。`cgt` の切り替えだけなら再ビルドは不要で、Git の差分も生じません。
Vibe と lazygit は既存設定のテーマ項目だけを更新し、その他の項目・コメント・ファイル権限を保ちます。
初回変更前の内容を隣の `config.toml.cgt-backup` / `config.yml.cgt-backup` に保存します。
lazygit の保存場所は `lazygit --print-config-dir` に従います（macOS の標準は `~/Library/Application Support/lazygit`）。

Vibe 3.1 は light に組み込みの `solarized-light`、dark に端末の ANSI 色を使う `ansi-dark` を選びます。
Dark Modern の背景・文字・ANSI 配色は Ghostty が供給するため、Ghostty の再読み込みも必要です。
Helix は `dark_plus` の構文色を継承し、Dark Modern の UI 色を上書きします。
OpenCode 2.1.4 は組み込みテーマと同じ V1 互換形式を読み込み、内部で V2 に変換します。

配色の参照元: [VS Code Dark Modern](https://github.com/microsoft/vscode/blob/main/extensions/theme-defaults/themes/dark_modern.json)、
[VS Code terminal colors](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminal/common/terminalColorRegistry.ts)。


## Installation

事前に次を用意してください。

- Homebrew。
- Mac App Store へのサインイン。
- [hosts/mac.nix](hosts/mac.nix) が参照するローカル tap `/Users/koki/Dev/mywork/eigo-no-hanon/homebrew-tap`。

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
