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
| `helix/` | Helix・共通 LSP・プロジェクト formatter（[詳細](#helix)） |
| `ghostty/` | Ghostty・herdr セッション起動 |
| `git/` | Git・共通 ignore |
| `shell/` | Zsh・エイリアス・プロンプト |
| `vscode/` | macOS 用 VS Code 設定・キーバインド |
| `opencode/` | [OpenCode ハーネス](../docs/opencode/README.md) |
| `skills/` | [グローバルスキルの配置](../docs/skills/README.md) |

`codex/config.toml` は未使用のスナップショットです。

## Helix

標準ピッカーは `Space e`（ファイルツリー）、`Space f`（ファイル）、`Space /`（全文検索）、`Space b`（バッファ）、`Space d`（診断）、`Space D`（ワークスペース診断）です。共通 LSP は Nix で用意します。プロジェクトの `.helix/languages.toml` で言語設定やサーバーを上書きできますが、ツール自体は導入されません。共通サーバーは自動起動することがあるため、プロジェクトの実行ファイルが必要な場合はプロジェクト環境から `hx` を起動してください。

`html`、`css`、`scss`、`javascript`、`jsx`、`typescript`、`tsx`、`elm`、`go`、`gomod`、`gowork`、`python`、`toml`、`json`、`jsonc`、`json-ld`、`nix` の17言語は、保存時の自動整形が既定で無効です。`:fmt`（`:format` の別名）で手動整形できます。formatter と保存時整形はプロジェクトごとに設定できます。たとえば、プロジェクトが用意した Prettier を使う場合は、`.helix/languages.toml` に次のように記述します。

```toml
[[language]]
name = "tsx"
formatter = { command = "prettier", args = ["--stdin-filepath", "%{buffer_name}"] }
auto-format = false
```

formatter コマンドは `hx` の `PATH` から実行できる必要があります。`node_modules/.bin` は自動では検索されず、Prettier はグローバル導入しません。保存時整形を使うプロジェクトでは `auto-format = true` にします。formatter を指定しない場合は利用可能な LSP の整形機能が使われることがありますが、Pyright は整形を提供しません。Elm では `elm-format` が別途必要で、Elm language server に `elm` や `elm-test` は含まれません。`gopls` の実行にはプロジェクトの Go 環境が必要です。Python の interpreter・仮想環境・依存関係もプロジェクト側で管理し、devbox、devenv、mise などの環境内から `hx` を起動してください。

## 方針

- パッケージと設定は `modules/<tool>/` にまとめ、入口を `default.nix` に統一します。
- モジュールの追加時は `home.nix` に明示して読み込みます。
