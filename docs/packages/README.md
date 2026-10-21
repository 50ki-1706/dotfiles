# パッケージ管理

汎用 CLI ツールは `modules/cli/`、独自パッケージは [packages/](../../packages/README.md) で管理します。

SSH キーは必要な環境で生成し、リポジトリには保存しません。

パッケージの変更後は [nix-verify](../../.agents/skills/nix-verify/SKILL.md) で検証し、[設定の適用](../home-manager/README.md#設定の適用) に従って反映します。

## プロジェクト開発環境

開発環境は devenv を基本とし、ランタイム・依存関係・環境変数・サービスをプロジェクト内の設定で管理します。Helix はその環境から起動します。

```sh
devenv shell
hx .
```

herdr から lint・typecheck・test を実行する場合も、それぞれ独立したシェルで `devenv shell -- <コマンド>` を実行します。

- `devenv init`: 新しいプロジェクトで devenv を採用するときだけ使い、生成ファイルはプロジェクトに置きます。
- `devenv up`: サービスを定義したプロジェクトでのみ使います。

devenv を使わないプロジェクトや、環境外で管理するツールには mise を使えます。バージョン固定はプロジェクトの `.mise.toml` に記述し、グローバルな固定や同じランタイムの二重管理は避けます。devenv と mise の自動的な優先順位や分離は前提にしません。
