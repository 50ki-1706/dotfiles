# modulesディレクトリについて

modulesディレクトリは、ツールごとのhome-managerモジュールを管理するためのディレクトリです。
`home.nix` から明示的にimportされ、各モジュールがパッケージ導入と設定ファイル配置を完結させます。

## 構成

| モジュール | 対象ツール | 内容 |
| --- | --- | --- |
| `cli.nix` | CLIツール | `home.packages` で導入する汎用CLIツール（fzf、lazygit、bitwarden-cli、devbox、nixfmt、ripgrep、yazi、yq-go、claude-code、vite-plus、uv、nodejs_24、playwright-cli、ollama） |
| `mise.nix` | mise | `programs.mise` の有効化とZsh連携 |
| `gh.nix` | GitHub CLI | `programs.gh` の有効化とSSHプロトコル設定 |
| `ssh.nix` | SSH | `programs.ssh` のGitHub向け鍵とmacOS Keychain連携 |
| `fonts.nix` | フォント | Nerd Fontの導入、fontconfig、macOSネイティブアプリ向けコピー |
| `helix.nix` | Helix | エディタ設定とYaziピッカー |
| `ghostty.nix` | Ghostty | ターミナル設定とZellij起動 |
| `zellij/` | Zellij | パッケージ、`layouts/ide.kdl`・`layouts/split.kdl`、`config.kdl` |
| `git/` | Git | `programs.git` と `ignore` の配置 |
| `shell/` | Zsh | `programs.zsh`、`aliases`、`prompt` の配置 |
| `vscode/` | VS Code | Darwin限定の `settings.json` / `keybindings.json` 配置 |
| `opencode/` | OpenCode | `programs.opencode`、エージェント設定、プロンプト、プラグイン配置 |
| `skills.nix` | OpenCodeスキル | `skills/` を `~/.agents/skills` から参照 |

`codex/config.toml` は未配置のスナップショットです。どのモジュールからも読み込まれません。

## 方針

- パッケージ導入と設定ファイル配置は、同じツールのモジュール内で完結させます。
- 生の設定ファイルを持つツールは、`modules/<tool>/default.nix` と同居させます。
- `home.nix` のimportは明示列挙とし、自動探索は行いません。
