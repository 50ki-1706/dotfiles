# リポジトリの最小サイズ

変更を加える前に、次を確認する。

1. 本当に必要か。既存のファイルや設定で代替できないか。一時的な用途なら、恒久的な追加を避ける。
2. 重複ではないか。同じ情報が他にないか。測定できる重複削減になるときだけ、既存の Nix の `let` や関数で共通化する。
3. 最小限か。必要十分を超えない。拡張性は考慮するが、今の要件に対して過剰にしない。

- 新しいファイルを足す前に、既存で代替できないかを確認する。
- 同じ情報を複数の場所に書かない。ドキュメントの重複は避け、参照する。
- 不要になったファイルや設定は削除する。
- 各ディレクトリの小さな AGENTS.md をポインターとして置く。必要なときだけ読む。
- 追加する前に削る。

詳細は `docs/USER_GUIDE.md` の「1. はじめに」と「4.1 設計思想」。

## AGENTS.md一覧

| 所在地 | 対象ディレクトリ | 参照する対象 | 内容 |
| --- | --- | --- | --- |
| `AGENTS.md` | リポジトリ全体 | `.dotfiles`を編集するエージェント | リポジトリの最小サイズを保つ判断基準と、AGENTS.md 一覧を定義しています。 |
| `modules/AGENTS.md` | `modules/` | `.dotfiles`を編集するエージェント | ツールごとのhome-managerモジュールと、配置対象の生設定ファイルの対応を説明しています。 |
| `modules/opencode/AGENTS.md` | `modules/opencode/` | OpenCode agent | OpenCode向けの作業ポリシー、回答や文書の言語、保守性、実装時の制約を定義しています。 |
| `hosts/AGENTS.md` | `hosts/` | `.dotfiles`を編集するエージェント | ホスト固有のhome-managerモジュールの管理方針、プラットフォーム別設定の分割方法を説明しています。 |
| `packages/AGENTS.md` | `packages/` | `.dotfiles`を編集するエージェント | home-managerで読み込むパッケージ定義と、`ssh-bootstrap.nix`によるSSHキー管理を説明しています。 |
| `scripts/AGENTS.md` | `scripts/` | `.dotfiles`を編集するエージェント | `install.sh`と`migrate-legacy-links.sh`などのセットアップスクリプトを説明しています。 |
| `skills/AGENTS.md` | `skills/` | `.dotfiles`を編集するエージェント | OpenCode/agentスキルの集約場所、`~/.agents/skills`へのデプロイ方法を説明しています。 |
