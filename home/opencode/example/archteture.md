-----
date: YYYY-MM-DD
commit-hash: (will be filled by agent)
-----

# Project overview
- このリポジトリの目的を、1〜3文で簡潔に要約してください。
- 何を解決するプロジェクトか、誰が使うかを中心に書いてください。

# Tech stack / Libraries
- 主要な技術スタックを、役割が分かるように列挙してください。
- 例: フロントエンド / バックエンド / UI / API / テスト / インフラ。

# Directory structure
```text
.
├── ...
└── ...
```
- 重要なディレクトリだけを残し、それぞれの役割を短く補足してください。

# Features / Modules and their dependency relationships
- 機能ごとに、役割と依存関係が分かる形で列挙してください。
- 依存の向きが伝わるように、上流から下流へ並べてください。
- 例:
  - `auth`
    - 役割: ...
    - 依存: ...
    - 関連モジュール: ...
  - `billing`
    - 役割: ...
    - 依存: ...
    - 関連モジュール: ...
