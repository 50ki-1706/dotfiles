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
