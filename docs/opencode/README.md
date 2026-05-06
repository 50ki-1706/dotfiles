# opencode 設定ディレクトリ

このディレクトリには opencode のエージェント設定とそれを管理するためのスクリプトが含まれています。

## 設計思想

この設定は、仕様駆動開発を意識したエージェント構成として設計しています。中心となる `spec` エージェントは、いきなり実装に入るのではなく、まず要求を明確化し、実装計画を作成し、その計画を `plan_review` でレビューし、ユーザー承認を得てから `execute` に実装を委譲する流れを前提にしています。

つまり、基本思想は次の順序です。

1. 仕様を明確にする
2. 実装計画に落とし込む
3. 計画をレビューする
4. 承認後に実装する
5. 最後に検証する

このため、複数ファイルにまたがる変更、影響範囲の見極めが必要な変更、受け入れ条件の整理が重要な変更は、`spec` を使う前提で設計しています。

一方で、`fast` は対象ファイルと変更内容がすでに明確な小規模タスク向けの高速レーンです。仕様策定や広い調査が不要な変更は `fast` で直接処理し、仕様の整理や計画レビューが必要な変更は `spec` に寄せる、という役割分担にしています。

### git 履歴確認の責務分担

`inspect` と `execute` では git 履歴確認コマンドの権限を以下のように使い分けている:

| エージェント | 用途 | 許可コマンド |
|---|---|---|
| `inspect` | 調査段階: コード履歴の調査・原因分析 | `git diff`, `git log`, `git show`, `git status`, `git blame` |
| `execute` | 実装チェック: 自身の変更確認・作業状態把握 | `git status`, `git status --short` のみ |

`execute` が履歴調査を必要とする場合は `spec` にエスカレーションし、`spec` が `inspect` に委譲する。

## エージェントフロー概要

- `idea`: 要件や方向性が曖昧な段階で、実装前のアイデア整理と仕様の具体化を支援する
- `spec`: 仕様の明確化、実装計画、計画レビュー、承認取得、実装委譲までを担当する
- `execute`: `spec` から渡された明確なタスクだけを実装する（`git status`, `git status --short` は実装チェック用に使用可能、`git log` / `git show` / `git blame` は禁止。履歴調査が必要な場合は `inspect` を使用する）
- `plan_review`: `spec` が作成した計画の不備や曖昧さをレビューする
- `fast`: ファイルと変更内容が明示されている小さな変更を素早く処理する
- `review`: 実装結果や変更差分をレビューする
- `inspect`: git 履歴確認（diff/log/show/status/blame）専用の調査サブエージェント

## ファイル構成

```
opencode/
├── opencode.json        # 生成物（scripts/opencode/sync.sh で自動生成）
├── config/
│   ├── base.json         # スキーマ・モデル・デフォルトエージェント設定
│   ├── watcher.json      # ファイル監視の除外パターン
│   ├── mcp.json           # MCP サーバー定義
│   └── permission.json    # グローバル権限ルール
├── agents/
│   ├── fast.json          # 小規模実装用エージェント
│   ├── spec.json          # 実装計画・実行管理エージェント
│   ├── review.json        # コードレビューエージェント
│   ├── idea.json          # アイデア整理エージェント
│   ├── deep_explore.json   # 広範囲コードベース調査サブエージェント
│   ├── explore.json       # 局所コード調査サブエージェント
│   ├── inspect.json       # git 履歴確認サブエージェント
│   ├── execute.json       # 実装サブエージェント
│   ├── internet_search.json # Web 検索サブエージェント
│   ├── plan_review.json   # 計画レビューサブエージェント
│   ├── build.json         # 無効化済みエージェント
│   ├── plan.json          # 無効化済みエージェント
│   └── general.json       # 無効化済みエージェント
├── prompts/              # エージェントごとのプロンプトファイル（Markdown）
└── AGENTS.md             # エージェントの行動ポリシー定義

scripts/opencode/
└── sync.sh               # 分割ファイル → opencode.json 統合スクリプト
```

### 分割ファイルのルール

- `config/` ディレクトリ: トップレベルキーごとに分割。重複するキーは禁止。
- `agents/` ディレクトリ: 1ファイルにつき1エージェント。ファイル名とJSON内のキー名が一致している必要がある（例: `fast.json` → `{"fast": {...}}`）。
- `opencode.json` は `scripts/opencode/sync.sh` で生成されるため、直接編集しない。

## scripts/opencode/sync.sh

`config/*.json` と `agents/*.json` を統合して `opencode.json` を生成するスクリプト。

### 使い方

```bash
# 同期実行
./scripts/opencode/sync.sh
```

### 挿入順

1. `config/base.json` → `config/watcher.json` → `config/mcp.json` → `config/permission.json` の順で deep merge
2. `agents/*.json` をアルファベット順で deep merge し、`agent` キー配下に配置
3. 1 と 2 を deep merge して `opencode.json` を生成

### 検証

スクリプトは実行前に以下を検証する:

- 各 `agents/*.json` がちょうど1つのトップレベルキーを持つこと
- ファイル名とキー名が一致すること
- `config/` ファイル間でトップレベルキーが重複していないこと
- エージェント名が重複していないこと

生成後、出力が有効な JSON であることを検証し、一時ファイルから原子性をもって置換する。

### 依存関係

`jq` が必要。

```bash
# Ubuntu/Debian
sudo apt install jq

# macOS
brew install jq
```

## 補足: OpenCode の環境変数参照

`opencode.json` で環境変数を参照するときは、一般的な `${VAR}` ではなく OpenCode の `{env:VAR}` 構文を使う。

```json
{
  "options": {
    "baseURL": "{env:SAKURA_BASE_URL}",
    "apiKey": "{env:SAKURA_API_KEY}"
  }
}
```

---

## 補足: websearch ツールの前提条件

`internet_search` エージェントが使用する `websearch` / `webfetch` ツールは、以下のいずれかの条件が満たされている場合のみ有効になります。

- OpenCode provider を使用している（`opencode/` プレフィックスのモデルを使用中）
- 環境変数 `OPENCODE_ENABLE_EXA=1` が設定されている

この前提が満たされていない環境では、`fast` / `spec` / `idea` から `internet_search` への委譲が失敗します。
