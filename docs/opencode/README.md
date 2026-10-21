# OpenCode エージェントハーネス

## 設計思想

- 必要な情報だけを渡す。ディレクトリ情報は各 `README.md`、共通方針はルートの [AGENTS.md](../../AGENTS.md)、OpenCode の作業ポリシーは [専用の AGENTS.md](../../modules/opencode/AGENTS.md) を参照する。
- 調査・計画・実装の役割と権限を分ける。
- 拡張前に組み込みエージェントで対応できないか確認する。

## エージェント構成

| エージェント | 区分 | 役割 |
| --- | --- | --- |
| `spec` | 独自 primary（既定） | 日本語での対話・計画・確認・委譲 |
| `general` | 組み込み subagent | 実装・検証・承認済みのアーキテクチャ文書更新 |
| `explore` | 組み込み subagent | 外部調査・アーキテクチャ理解・詳細なコード調査 |
| `plan_review` | 独自 subagent | 計画・設計相談・重要な実装変更のレビュー |

基本の流れは `spec → explore / plan_review → ユーザー確認 → general` です。浅い調査は `spec` が行い、委譲時に制約・調査の深さ・成果物・検証方法を指定します。重要な変更は実装後も `plan_review` で確認します。

サブエージェントは再委譲しません。アーキテクチャ文書の更新は、計画に含めて承認された場合に `spec` から `general` へ直接依頼します。`plan_review` の最新結果が `STATUS: COMPLETE` なら、`spec` は質問前に日本語の実装計画を提示します（所定の見出しに従い、ツール呼び出しを伴わない本文のみ）。

組み込みの `build`・`plan` も利用できます。各エージェントの既定モデルと切り替え順は、[設定の変更先](#設定の変更先) にある定義を参照してください。

## 権限と制約

| エージェント | ファイル・シェル | MCP | スキル | 委譲先 |
| --- | --- | --- | --- | --- |
| `spec` | 読み取り・シェルを許可、編集は拒否 | Graphify | グローバル + プロジェクトで許可したもの | `explore`・`general`・`plan_review` |
| `general` | 実装を許可、外部ディレクトリは拒否 | Graphify・Chrome DevTools | グローバルのみ | なし |
| `explore` | 読み取り専用、シェルに制限 | Graphify | なし | なし |
| `plan_review` | 読み取り専用、指示でシェルを禁止、編集・質問は拒否 | Graphify | なし | なし |

グローバルスキルの許可対象は [スキル一覧](../../skills/README.md) の5つです。このリポジトリでは `spec` に `nix-verify` も許可します。スキルの利用許可と、`SKILL.md` 自体の読み取り権限は別です。

全エージェントに、危険なコマンドの拒否、push・switch 前の確認、機密ファイルの読み取り制限を課します。`config.env` などは確認が必要で、`.env`・`*.key`・`*.pem`・`id_rsa*` などは拒否します。規則が重なる `config.env.private.key` なども拒否します。シェルの拒否規則は完全なサンドボックスではありません。

MCP は既知のツールだけを許可します。未知の action は拒否され、セッション中の個別承認では解除できません。[変更検出の手順](#アクション空間のドリフト検出) に従って確認してください。

## 設定の変更先

| 対象 | 参照先 |
| --- | --- |
| エージェント・既定モデル | [agents.nix](../../modules/opencode/agents.nix) |
| モデル・推論強度 | [providers.nix](../../modules/opencode/providers.nix) |
| 権限・共通制限 | [permissions.nix](../../modules/opencode/permissions.nix)・[guards.nix](../../modules/opencode/guards.nix) |
| 許可する action・ツール | [actions.nix](../../modules/opencode/actions.nix) |
| コマンド・MCP | [opencode.nix](../../modules/opencode/opencode.nix) |
| 指示・出力形式 | [prompts/](../../modules/opencode/prompts/) |
| テーマ・端末 UI | [cli.nix](../../modules/opencode/cli.nix) |
| モデル切り替え順・失敗回数 | [chains.nix](../../packages/opencode-model-fallback/chains.nix) |
| プロジェクト固有の許可 | [opencode.json](../../opencode.json) |
| OpenCode 本体のバージョン | [opencode.nix](../../packages/opencode.nix) |

`spec`・`plan_review` の指示は英語、`spec` のユーザー向け計画・質問・報告は日本語に統一します。共通の出力形式は `modules/opencode/prompts/output-format.md` を参照してください。

推論強度はモデル ID 末尾の `#medium`・`#max` などで選びます。利用可能な値は `providers.nix` を確認してください。`variants = [ ]` のモデルは接尾辞を付けず、既定設定を使います。

モデルの自動切り替えは、通信エラー・タイムアウト・内部エラー・レート制限のいずれかが各モデルで3回続くと、設定順に次を試します。OpenCode の再試行判断は変えず、切り替え先に OpenCode Go は使いません。

## ファイル配置

設定は `~/.config/opencode/` 以下に配置されます。

| 配置先 | 内容 |
| --- | --- |
| `opencode.json` | エージェント・権限・モデル・MCP |
| `AGENTS.md` | 共通の作業ポリシー・出力形式 |
| `cli.json` | 端末 UI 設定 |
| `plugins/` | 計画提示・権限・モデル切り替え・Nix 検証の制御 |

アプリ内のテーマ・`/thinking` などの変更は保存に失敗したり、次の設定適用で戻ったりする場合があります。永続的な変更は `modules/opencode/cli.nix` を編集して適用してください。

設定変更後は [nix-verify](../../.agents/skills/nix-verify/SKILL.md) に従って検証し、`./result/home-files/.config/opencode/` の設定・指示・プラグインも確認します。Nix が参照する新規ファイルはビルド前に Git に追加してください。反映方法は [設定の適用](../home-manager/README.md#設定の適用) を参照してください。

## アクション空間のドリフト検出

OpenCode や MCP の更新で action・ツールが追加・削除・改名されると、許可対象との差分が生じます。確認は Apple Silicon macOS で実行します。

```sh
nix run .#opencodeActionCheck
```

| 終了コード | 意味 |
| --- | --- |
| `0` | 差分なし |
| `1` | 追加・削除・action 変更あり |
| `2` | 判定保留（MCP 起動失敗・確認の省略など） |

`--home ./result` は適用前の候補を検証し、`--capture` は候補 baseline を標準出力に出します。`--skip-introspection` で MCP の確認を省略し、`--mcp-timeout <秒>` で待ち時間を指定できます。

### 修正手順

1. 上のコマンドで現状を確認します。
2. `nix run .#opencodeActionCheck -- --capture` で候補 baseline を取得します（ファイルへの書き込みなし）。
3. 追加項目はアクセス権の付与に当たるため、ユーザーの承認を得てから `modules/opencode/actions.nix` を更新します。
4. [nix-verify](../../.agents/skills/nix-verify/SKILL.md) に従い、整形・Home Manager ビルド・darwin ビルドを行います。
5. `nix run .#opencodeActionCheck -- --home ./result --workdir /Users/koki/.dotfiles` で候補を確認します。`--workdir` には `graphify-out` があるリポジトリの実体を指定します。
6. ユーザーから反映の明示依頼があれば、[設定の適用](../home-manager/README.md#設定の適用) に進みます。

削除・改名とサーバー障害を区別できない場合は、`opencode mcp list` と `~/.local/share/opencode/log` を確認してください。判定保留を差分なしと扱わないでください。

新しい組み込みツールは、チェッカーで列挙できず初回の権限評価で拒否される場合があります。権限評価を通らない機能は検出できないため、更新時に手動レビューが必要です。

公式仕様: [エージェント](https://opencode.ai/v2/docs/agents/)、[権限](https://opencode.ai/v2/docs/permissions/)、[モデル](https://opencode.ai/v2/docs/models/)。
