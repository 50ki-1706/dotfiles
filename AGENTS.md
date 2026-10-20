# リポジトリの最小サイズ

変更前に、次の3点を確認する。

1. 必要か。既存のファイルや設定で代替できないか確認し、一時的な用途では恒久的な追加を避ける。
2. 重複しないか。既存の Nix の `let` や関数による共通化は、重複の削減を測定できる場合に限る。
3. 最小限か。拡張性を考慮しつつ、現在の要件に必要な範囲にとどめる。

- 同じ情報を複数箇所に書かず、ドキュメントは参照でつなぐ。
- 不要になったファイルや設定は削除する。
- 各ディレクトリの短い `README.md` を案内とし、必要なときだけ読む。
- 追加より削減を優先する。

概要は [はじめに](docs/introduction/README.md)、ハーネスの設計思想は [OpenCode](docs/opencode/README.md) を参照する。

## 案内ファイル一覧

編集対象に応じて参照する。`modules/opencode/AGENTS.md` は配置先の OpenCode 向けポリシー。

| 参照先 | 内容 |
| --- | --- |
| [AGENTS.md](AGENTS.md) | リポジトリ全体の判断基準と案内 |
| [modules/README.md](modules/README.md) | Home Manager モジュールと設定ファイル |
| [modules/opencode/AGENTS.md](modules/opencode/AGENTS.md) | OpenCode の作業ポリシー |
| [hosts/README.md](hosts/README.md) | ホスト固有の設定 |
| [packages/README.md](packages/README.md) | Nix パッケージ定義 |
| [scripts/README.md](scripts/README.md) | セットアップ・検証スクリプト |
| [skills/README.md](skills/README.md) | スキルの配置・管理 |
