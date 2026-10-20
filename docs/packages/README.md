# パッケージ・アプリ管理

| 対象 | 変更先 |
| --- | --- |
| 汎用 CLI ツール | [modules/cli/default.nix](../../modules/cli/default.nix) |
| ツール固有のパッケージ・設定 | [modules/](../../modules/README.md) |
| Homebrew の formula・cask・tap、Mac App Store アプリ、VS Code 拡張機能 | [hosts/mac.nix](../../hosts/mac.nix) |
| 独自パッケージ | [packages/](../../packages/README.md) |
| Nix 入力のバージョン・依存関係 | [flake.nix](../../flake.nix)・[flake.lock](../../flake.lock) |

Homebrew の項目は nix-darwin の適用時に導入します。現在の `onActivation` は自動更新・既存パッケージのアップグレード・一覧外パッケージの削除を行いません。Homebrew 本体などの準備は [初期設定](../scripts/README.md#初期設定) を参照してください。

mise のグローバル設定は使わず、プロジェクト単位のバージョン固定は `.mise.toml` で指定できます。

パッケージの変更後は [nix-verify](../../.agents/skills/nix-verify/SKILL.md) で検証し、[設定の適用](../home-manager/README.md#設定の適用) に従って反映します。
