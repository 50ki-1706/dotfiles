- home-managerをビルドするときはnix経由で行なってください。

```sh
nix run home-manager -- switch --flake .#koki
```
- コードベースは無駄がない実装を心がけて下さい。
- ディレクトリ構造は複雑にならないよう意識して下さい。
- 必ず将来性、拡張性を意識した実装計画を立てて下さい。
- nixコードベースを変更した場合は必ず`nix-verify`スキル（`.agents/skills/nix-verify/SKILL.md`）に従ってください。

- このリポジトリには、各ディレクトに`AGENTS.md`があり、そこにそのディレクトリの目的や構成が書いてあります。変更を加えるときは、必ずそのディレクトリの`AGENTS.md`を確認してから作業してください。

## AGENTS.md一覧

| 所在地 | 対象ディレクトリ | 参照する対象 | 内容 |
| --- | --- | --- | --- |
| `AGENTS.md` | リポジトリ全体 | `.dotfiles`を編集するエージェント | home-managerのビルド方法、シンプルな実装方針、nix変更時の検証方針、各ディレクトリの`AGENTS.md`確認ルールを定義しています。 |
| `home/AGENTS.md` | `home/` | `.dotfiles`を編集するエージェント | `home.nix`を入口に、git.nix、shell.nix、vscode.nixなどhome-managerの設定、関連docsの所在をまとめています。 |
| `home/dotfiles/` | `home/dotfiles/` | `.dotfiles`を編集するエージェント | home-managerから配置する生設定ファイルを管理します（git/ignore、vscode/、shell/aliases）。codex/config.tomlは未配置のスナップショットです。 |
| `hosts/AGENTS.md` | `hosts/` | `.dotfiles`を編集するエージェント | ホスト固有のhome-managerモジュールの管理方針、プラットフォーム別設定の分割方法を説明しています。 |
| `home/opencode/AGENTS.md` | `home/opencode/` | OpenCode agent | OpenCode向けの作業ポリシー、回答や文書の言語、保守性、実装時の制約を定義しています。 |
| `packages/AGENTS.md` | `packages/` | `.dotfiles`を編集するエージェント | home-managerで読み込むパッケージ定義と、`ssh-bootstrap.nix`によるSSHキー管理を説明しています。 |
| `scripts/AGENTS.md` | `scripts/` | `.dotfiles`を編集するエージェント | `install.sh`と`migrate-legacy-links.sh`などのセットアップスクリプトを説明しています。 |
| `skills/AGENTS.md` | `skills/` | `.dotfiles`を編集するエージェント | OpenCode/agentスキルの集約場所、`~/.agents/skills`へのデプロイ方法を説明しています。 |
