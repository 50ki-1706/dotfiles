# パッケージ管理

汎用 CLI ツールは `modules/cli/`、独自パッケージは [packages/](../../packages/README.md) で管理します。mise のグローバル設定は使わず、プロジェクト単位のバージョン固定は `.mise.toml` で指定できます。

SSH キーは必要な環境で生成し、リポジトリには保存しません。

パッケージの変更後は [nix-verify](../../.agents/skills/nix-verify/SKILL.md) で検証し、[設定の適用](../home-manager/README.md#設定の適用) に従って反映します。
