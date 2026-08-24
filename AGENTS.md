- home-managerをビルドするときはnix経由で行なってください。

```sh
nix run home-manager -- switch --flake .#koki
```
- コードベースは無駄がない実装を心がけて下さい。
- ディレクトリ構造は複雑にならないよう意識して下さい。
- 必ず将来性、拡張性を意識した実装計画を立てて下さい。
- nixコードベースを変更した場合は必ず`nix-verify`スキルに従ってください。

- このリポジトリには、各ディレクトに`AGENTS.md`があり、そこにそのディレクトリの目的や構成、EDRタイムラインの記録方法が書いてあります。変更を加えるときは、必ずそのディレクトリの`AGENTS.md`を確認してから作業してください。

## AGENTS.md一覧

| 所在地 | 対象ディレクトリ | 参照する対象 | 内容 |
| --- | --- | --- | --- |
| `AGENTS.md` | リポジトリ全体 | `.dotfiles`を編集するエージェント | home-managerのビルド方法、シンプルな実装方針、nix変更時の検証方針、各ディレクトリの`AGENTS.md`確認ルールを定義しています。 |
| `config/AGENTS.md` | `config/` | `.dotfiles`を編集するエージェント | インストールスクリプトでシンボリックリンクする、ユーザー編集可能な設定ファイルを管理します。 |
| `git/AGENTS.md` | `git/` | `.dotfiles`を編集するエージェント | Git関連ファイルを置くディレクトリです。現在はグローバルignore設定を管理しています。 |
| `home/AGENTS.md` | `home/` | `.dotfiles`を編集するエージェント | home-managerで管理するツール、ライブラリ、Zsh/GitHub CLI/OpenCodeなどの設定、関連docsの所在、EDRタイムラインの記録方法をまとめています。 |
| `hosts/AGENTS.md` | `hosts/` | `.dotfiles`を編集するエージェント | ホスト固有のhome-managerモジュールの管理方針、プラットフォーム別設定の分割方法、EDRタイムラインの記録方法を説明しています。 |
| `home/opencode/AGENTS.md` | `home/opencode/` | OpenCode agent | OpenCode向けの作業ポリシー、回答や文書の言語、保守性、実装時の制約を定義しています。 |
| `packages/AGENTS.md` | `packages/` | `.dotfiles`を編集するエージェント | home-managerで読み込むパッケージ定義と、`ssh-bootstrap.nix`によるSSHキー管理、EDRタイムラインの記録方法を説明しています。 |
| `scripts/AGENTS.md` | `scripts/` | `.dotfiles`を編集するエージェント | `install.sh`、`lib/accounts.sh`、`lib/symlink.sh`などのセットアップスクリプトと、EDRタイムラインの記録方法を説明しています。 |
| `shell/AGENTS.md` | `shell/` | `.dotfiles`を編集するエージェント | shell aliasesの管理方法、home-managerからの読み込み、既存環境を壊さないためのsource方針、EDRタイムラインの記録方法を説明しています。 |
| `skills/AGENTS.md` | `skills/` | `.dotfiles`を編集するエージェント | OpenCode/agentスキルの集約場所、`~/.agents/skills`へのデプロイ方法、EDRタイムラインの記録方法を説明しています。 |
