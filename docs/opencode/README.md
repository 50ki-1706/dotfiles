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

組み込みの `build`・`plan` も利用できます。各エージェントの既定モデルと切り替え順は、[設定の変更先](#設定の変更先) にある定義を参照してください。Figma の読み取り権限はグローバル設定で全エージェント（組み込みを含む）に付与します。

## 権限と制約

| エージェント | ファイル・シェル | MCP | スキル | 委譲先 |
| --- | --- | --- | --- | --- |
| `spec` | 読み取り・シェルを許可、編集は拒否 | Graphify・Figma（読み取り） | グローバル + プロジェクトで許可したもの | `explore`・`general`・`plan_review` |
| `general` | 実装を許可、外部ディレクトリは拒否 | Graphify・Chrome DevTools・Figma（読み取り + Code Connect マッピング追加） | グローバルのみ | なし |
| `explore` | 読み取り専用、シェルに制限 | Graphify・Figma（読み取り） | なし | なし |
| `plan_review` | 読み取り専用、指示でシェルを禁止、編集・質問は拒否 | Graphify・Figma（読み取り） | なし | なし |

グローバルスキルの許可対象は [スキル一覧](../../skills/README.md) の5つです。このリポジトリでは `spec` に `nix-verify` も許可します。スキルの利用許可と、`SKILL.md` 自体の読み取り権限は別です。

全エージェントに、危険なコマンドの拒否、push・switch 前の確認、機密ファイルの読み取り制限を課します。`config.env` などは確認が必要で、`.env`・`*.key`・`*.pem`・`id_rsa*` などは拒否します。規則が重なる `config.env.private.key` なども拒否します。シェルの拒否規則は完全なサンドボックスではありません。

MCP は既知のツールだけを許可します。未知の action は拒否され、セッション中の個別承認では解除できません。[変更検出の手順](#アクション空間のドリフト検出) に従って確認してください。

### Figma MCP

remote MCP の接続先は `https://mcp.figma.com/mcp` です。Figma だけ `codemode = false` にして読み取りツールを直接公開します。`spec` は `execute` を拒否したまま Figma を参照できます。他の local server の codemode 既定値は変更しません。

OAuth はブラウザー経由のみで、認証情報は設定ファイル外に保存されます。反映後の初回認証・再認証は `/mcps` または `opencode mcp auth figma` から行います。

許可する action は `actions.nix` の次の8個だけです。読み取り7個は全エージェント、書き込み1個は `general` のみに付与します。

| 種別 | action |
| --- | --- |
| 読み取り | `figma_get_design_context`・`figma_get_metadata`・`figma_get_screenshot`・`figma_get_variable_defs`・`figma_get_figjam`・`figma_get_code_connect_map`・`figma_whoami` |
| 書き込み | `figma_add_code_connect_map`（Code Connect マッピング追加のみ） |

`use_figma` による canvas 編集・削除・任意コード実行、コード・アーカイブ・ファイル・UI のアップロード、課金・クレジット消費のある action、未レビューのツールは許可しません。`figma*` の allow は作らず、各権限リストの先頭に `figma*` deny を置いてから exact allow を並べます。未知・除外 action は fail-closed で拒否されます。

この8個は公式ドキュメントのツール名に基づく documented-not-live の allowlist で、remote OAuth の `figma` は checker の stdio introspection 対象外です。live の `tools/list` や実呼び出しは未検証です。上流で名前が変わった場合は未知 action として拒否されるため、接続後に `opencode mcp list` と承認済みの読み取りで確認し、必要なら live capture とユーザー承認を経て baseline を更新してください。認証・接続状態だけではツール名を保証しません。

Figma の list/read resource は引き続き拒否します。ツール action の許可と resource 列挙は独立です。`list_mcp_resources` を server 省略で呼ぶと Figma を含むため呼び出し全体が拒否されます。他の server を列挙する場合は `server` に `graphify` などを明示してください。`read_mcp_resource` の `figma` URI も拒否されます。

公式: [Tools and prompts](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/)、[Write to canvas](https://developers.figma.com/docs/figma-mcp-server/write-to-canvas/)、[Local server installation](https://developers.figma.com/docs/figma-mcp-server/local-server-installation/)。

### プロジェクト固有の MCP

MCP server の定義はプロジェクトの `opencode.json` の `mcp.servers.<name>` にも置けます。local server の `command` 配列、`cwd`、`environment`、`codemode` はプロジェクト側で指定でき、バイナリもプロジェクト内のラッパーで構いません。グローバルな server 登録は必須ではありません。

権限は `agents.<id>.permissions` に exact action で書きます。設定プラグインは全ドキュメントの top-level `permissions` を各エージェントの agent 固有ルールより先に結合し、権限評価は最後に一致したルールを採用します。そのため、プロジェクトの top-level allow は後続の agent 固有 `denyAll` の blanket deny や個別 deny を打ち消せず、全エージェントで有効になる保証もありません。プロジェクト固有 MCP の許可は `agents.<id>.permissions` に置き、グローバルな agent ルールより後に評価される exact allow にしてください。この節は MCP 権限の指針であり、top-level allow を一律に禁止するものではありません（既存の `opencode.json` にも skill allow があります）。

現行の action-drift-monitor は `actions.nix` から生成したグローバル baseline に載っている exact action しか通しません。プロジェクト側で allow しても、未知 action は permission.evaluate で拒否されます。したがってプロジェクト固有 server を使うには、その action 名をレビュー・承認済みのうえ `actions.nix` の `ruleActions` と monitor baseline に追加する必要があります。server のグローバル登録やグローバルな権限付与は不要です。

checker の `ruleActions` は「既知」の集合で、観測された未知 action は追加（exit 1）です。`expectedRuleActions` は「現行リポジトリ設定が必ず出力する」集合で、欠落は削除（exit 1）です。将来プロジェクト固有 action を既知にするだけの場合、次のどちらかが必要です。

- グローバル設定に exact の deny ルールを出力して観測可能にし、`expectedRuleActions` を満たす。
- その action を `expectedRuleActions` から除外する。

これは generic な optional baseline の設計変更であり、現時点では実装しません。Figma は `figma*` deny と8個の exact action を出力するため `expectedRuleActions` に含まれます。全エージェントで `figma = "inherit"` にすると出力が消え、削除 drift になります。

**条件付き:** 以下は将来の generic 対応が承認された場合の最小例で、現行 monitor のままではそのまま使えません（`myproj_get_thing` が baseline 未登録なら拒否されます）。

```jsonc
{
  "mcp": {
    "servers": {
      "myproj": {
        "type": "local",
        "command": ["/Users/koki/bin/myproj-mcp"],
        "codemode": false
      }
    }
  },
  "agents": {
    "general": {
      "permissions": [
        { "action": "myproj_get_thing", "resource": "*", "effect": "allow" }
      ]
    }
  }
}
```

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

モデルの自動切り替えは、通信エラー・タイムアウト・内部エラー・一時的なレート制限のいずれかが各モデルで3回続くと、設定順に次を試します。クレジット枯渇や課金・利用上限を検出した場合は最初の失敗で切り替えを試します。OpenCode の再試行判断は変えず、切り替え先に OpenCode Go は使いません。実装と利用方法は [プラグインの README](../../packages/opencode-model-fallback/README.md) を参照してください。

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

checker は stdio サーバーだけを検査します。remote OAuth の `figma` は baseline のサーバー一覧・introspection allowlist に含めないため、Figma の action 名は live 検証されません。`figma` の documented-not-live な名前は [Figma MCP](#figma-mcp) の説明に従って別途確認してください。

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
