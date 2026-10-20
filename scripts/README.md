# スクリプト一覧

- `lib/accounts.sh`: GitHub アカウント・SSH キーの管理。
- `migrate-legacy-links.sh`: 旧 Git ignore・VS Code リンクの移行（Zsh で実行）。
- `install.sh`: 対話式の初期設定（Zsh で実行）。
- `check-opencode-actions.sh`: OpenCode の権限対象の変更検出。通常は `nix run .#opencodeActionCheck` で実行。
- `check-nix-verify-gate.mjs`: Nix 検証の順序・適用制御の確認（Node.js で実行。設定は適用しない）。

手順と注意点は [初期設定・Git アカウント管理](../docs/scripts/README.md)、権限の確認は [変更検出の手順](../docs/opencode/README.md#アクション空間のドリフト検出) を参照してください。
