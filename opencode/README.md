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

## エージェントフロー概要

- `idea`: 要件や方向性が曖昧な段階で、実装前のアイデア整理と仕様の具体化を支援する
- `spec`: 仕様の明確化、実装計画、計画レビュー、承認取得、実装委譲までを担当する
- `execute`: `spec` から渡された明確なタスクだけを実装する
- `plan_review`: `spec` が作成した計画の不備や曖昧さをレビューする
- `fast`: ファイルと変更内容が明示されている小さな変更を素早く処理する
- `review`: 実装結果や変更差分をレビューする

## ファイル構成

```
opencode/
├── opencode.json      # メイン設定ファイル（エージェント定義・モデル・プロンプト）
├── models.tsv         # エージェントごとのモデル設定（TSV形式）
├── prompts/           # エージェントごとのプロンプトファイル（Markdown）
├── AGENTS.md          # エージェントの行動ポリシー定義
├── sync_models.sh     # models.tsv → opencode.json へモデル設定を同期
└── sync_prompts.sh    # prompts/*.md → opencode.json へプロンプトを同期
```

## sync_models.sh

`models.tsv` に記述したモデル名を `opencode.json` に同期するスクリプト。

### 使い方

```bash
# 同期実行
./sync_models.sh

# 変更内容の確認のみ（ファイルへの書き込みなし）
./sync_models.sh --dry-run
```

### models.tsv の書式

タブ区切りの2カラム形式。`#` で始まる行はコメントとして無視される。

```tsv
# agent_name	model
model	anthropic/claude-sonnet-4-6      # トップレベルの model キー
small_model	anthropic/claude-haiku-4-5   # トップレベルの small_model キー
spec	anthropic/claude-opus-4-6          # agent.spec.model
execute	opencode/kimi-k2.5             # agent.execute.model
```

`model` と `small_model` はトップレベルキーとして処理され、それ以外はすべて `.agent.<name>.model` として処理される。

---

## sync_prompts.sh

`prompts/` ディレクトリ内の Markdown ファイルから `## Prompt` セクションを抽出し、対応するエージェントの `prompt` フィールドを `opencode.json` に同期するスクリプト。

### 使い方

```bash
./sync_prompts.sh
```

### prompts/*.md の書式

ファイル名（拡張子なし）がエージェント名に対応する。`## Prompt` という見出し以降のテキストがプロンプト本文として抽出される。

```markdown
# spec エージェント

（説明や備考など、自由に記述可）

## Prompt

ここに書いた内容が opencode.json の agent.spec.prompt に書き込まれる。
```

- `## Prompt` セクションが存在しないファイルはスキップされる
- `opencode.json` に対応するエージェントキーが存在しないファイルもスキップされる
- すべての更新は jq を1回だけ実行してアトミックに適用される

### 依存関係

両スクリプトとも `jq` が必要。

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

```bash
# Ubuntu/Debian
sudo apt install jq
```
