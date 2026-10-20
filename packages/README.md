# パッケージ定義

Home Manager・flake 用の独自パッケージを置きます。

- `ssh-bootstrap.nix`: SSH キーの生成・管理。
- `opencode.nix`: OpenCode CLI のバージョン固定。
- `opencode-action-check.nix`: OpenCode の権限対象の変更検出（Apple Silicon macOS 用）。
- `opencode-model-fallback/`: OpenCode のモデル切り替え。
- `playwright-cli.nix`: Playwright CLI のバージョン固定。

変更方法は [パッケージ管理](../docs/packages/README.md) を参照してください。
