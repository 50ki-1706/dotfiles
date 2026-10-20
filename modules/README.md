# ツール設定

ツールごとの Home Manager 設定を置きます。

## 構成

| ディレクトリ | 対象・用途 |
| --- | --- |
| `cli/` | 汎用 CLI ツール |
| `mise/` | mise の Zsh 連携。バージョン固定はプロジェクトの `.mise.toml` で指定 |
| `gh/` | GitHub CLI・SSH 接続 |
| `ssh/` | GitHub 用 SSH キー・macOS Keychain |
| `fonts/` | Nerd Font・fontconfig・macOS アプリ用フォント |
| `helix/` | Helix |
| `ghostty/` | Ghostty・herdr セッション起動 |
| `git/` | Git・共通 ignore |
| `shell/` | Zsh・エイリアス・プロンプト |
| `vscode/` | macOS 用 VS Code 設定・キーバインド |
| `opencode/` | [OpenCode ハーネス](../docs/opencode/README.md) |
| `skills/` | [グローバルスキルの配置](../docs/skills/README.md) |

`codex/config.toml` は未使用のスナップショットです。

## 方針

- パッケージと設定は `modules/<tool>/` にまとめ、入口を `default.nix` に統一します。
- モジュールの追加時は `home.nix` に明示して読み込みます。
