# modulesディレクトリについて

modulesディレクトリは、ツールごとのhome-managerモジュールを管理するためのディレクトリです。
`home.nix` から明示的にimportされ、各モジュールがパッケージ導入と設定ファイル配置を完結させます。

## 構成

| モジュール | 対象ツール | 内容 |
| --- | --- | --- |
| `cli/` | CLIツール | `home.packages` で導入する汎用CLIツール（fzf、lazygit、bitwarden-cli、devbox、devenv、nixfmt、ripgrep、yazi、yq-go、claude-code、vite-plus、uv、nodejs_24、playwright-cli、ollama） |
| `mise/` | mise | `programs.mise` の有効化とZsh連携のみ。グローバル設定 `~/.config/mise/config.toml` は廃止済みで、グローバルCLIツールはNix管理。プロジェクト単位の `.mise.toml` によるピン留めは可 |
| `gh/` | GitHub CLI | `programs.gh` の有効化とSSHプロトコル設定 |
| `ssh/` | SSH | `programs.ssh` のGitHub向け鍵とmacOS Keychain連携 |
| `fonts/` | フォント | Nerd Fontの導入、fontconfig、macOSネイティブアプリ向けコピー |
| `helix/` | Helix | エディタ設定とYaziピッカー |
| `ghostty/` | Ghostty | ターミナル設定とZellij起動 |
| `zellij/` | Zellij | パッケージ、`layouts/ide.kdl`・`layouts/split.kdl`、`config.kdl` |
| `git/` | Git | `programs.git` と `ignore` の配置 |
| `shell/` | Zsh | `programs.zsh`、`aliases`、`prompt` の配置 |
| `vscode/` | VS Code | Darwin限定の `settings.json` / `keybindings.json` 配置 |
| `opencode/` | OpenCode | `programs.opencode`、エージェント設定、プロンプト、プラグイン配置 |
| `skills/` | OpenCodeスキル | リポジトリルートの `skills/` ディレクトリを `~/.agents/skills` にリンク |

`codex/config.toml` は未配置のスナップショットです。どのモジュールからも読み込まれません。

## 方針

- パッケージ導入と設定ファイル配置は、同じツールのモジュール内で完結させます。
- すべてのトップレベルモジュールは、単一ファイルの場合も含めて `modules/<tool>/default.nix` に配置します。
- 生の設定ファイルを持つツールは、`modules/<tool>/default.nix` と同居させます。
- `home.nix` のimportは明示列挙とし、自動探索は行いません。
