# opencode 設定ディレクトリ

このディレクトリには opencode のエージェント設定とそれを管理するためのスクリプトが含まれています。

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
