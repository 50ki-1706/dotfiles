# OpenCode Model Fallback

エージェントごとのモデルチェーンを使い、失敗時に次のモデルへ切り替えるプラグインです。
OpenCode **2.0.22** のセッションフックを対象にしています。

## 使い方

OpenCode が読み込むプラグインのエントリーポイントで設定を渡します。

```js
import { createModelFallbackPlugin } from "./opencode-model-fallback/plugin.js"

export default createModelFallbackPlugin({
  threshold: 3,
  agents: {
    general: {
      primary: "provider/primary-model#high",
      fallbacks: ["provider/fallback-model#max", "another-provider/last-model"],
    },
  },
})
```

`threshold` は切り替えるまでの通信失敗の回数を表す正の整数です。
`agents` にエージェント名と、既定モデル・切り替え先の順序を指定します。
モデルは `provider/model` または `provider/model#variant` で指定し、同じチェーン内では重複させません。
`#default` と接尾辞なしは同じモデルとして扱います。

## 仕様

| エラー | 動作 |
| --- | --- |
| 通信・タイムアウト・内部エラー・一時的なレート制限 | `threshold` 回ごとに切り替えを試す |
| クレジット枯渇・課金上限・サブスクリプションや無料枠の利用上限 | 最初の失敗で切り替えを試す |
| その他 | 失敗回数をリセットする |

- 失敗回数はセッションごとに保持し、正常な応答でリセットします。コンパクション前の成功も引き継ぎます。
- 切り替え先はルートの会話とエージェント名ごとに保存し、子セッション間やプラグイン再読み込み後も共有します。新しい会話では既定モデルから開始します。
- `subagent` で明示した `model` や、`sessionID` を指定した再開時のモデルは上書きしません。
- 切り替え成功時は即座に再試行します。失敗時やチェーン末尾では元の再試行判定を維持し、OpenCode 本体の再試行回数の上限に従います。
- 古いモデルのイベントやチェーン外のモデルでは切り替えません。すでに起動済みの子は、失敗時に保存済みの切り替え先へ追従します。
- 経過は `[model-fallback]` ログに出力します。フォアグラウンドの子が失敗した場合は、親に返すエラーに状況と必要な再開手順を添えます。

## 開発

```sh
cd packages/opencode-model-fallback
npm test
npm pack --dry-run
```

Nix 用の設定は `chains.nix`、生成エントリーポイントは `result/home-files/.config/opencode/plugins/model-fallback.js` です。
