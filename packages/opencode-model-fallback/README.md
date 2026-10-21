# OpenCode Model Fallback

エージェントごとに設定した順番で、失敗したモデルから次のモデルへ切り替えるプラグインです。
プラグイン本体は Nix や個人のモデル設定に依存しない、外部依存のない ES Modules です。
このリポジトリでは OpenCode **2.0.22** のセッションフックを対象にしています。

## 利用例

OpenCode が読み込むプラグインのエントリーポイントで、設定を渡します。
以下はパッケージをローカル配置した場合の例です。

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

`threshold` は通信失敗を何回数えてから切り替えるかを表す正の整数です。
`agents` のキーはエージェント名、`primary` は既定モデル、`fallbacks` は順番に試すモデルです。
モデルは `provider/model` または `provider/model#variant` で指定します。
同じチェーンにモデルを重複させず、`#default` と接尾辞なしは同じモデルとして扱います。

## 切り替え条件

| エラー | 動作 |
| --- | --- |
| 通信・タイムアウト・内部エラー・一時的なレート制限 | `threshold` 回ごとに次のモデルへの切り替えを試す |
| クレジット枯渇・課金上限・サブスクリプションや無料枠の利用上限 | 最初の失敗で次のモデルへの切り替えを試す |
| その他のエラー | 失敗回数をリセットする |

課金・利用上限は正規化されたエラー種別に加えて、`message` と文字列の `response.body` にある既知のコード・文言でも判定します。
通常のレート制限は通信失敗として数えます。未知の上限表現をすべて検出するものではありません。

状態はセッションごとに保持し、正常な応答で失敗回数をリセットします。
コンパクション前の成功も記憶し、履歴が短縮された後に引き継ぎます。
通信失敗時に履歴取得が失敗した場合は、記憶済みの成功がある場合だけカウントします。
課金・利用上限の切り替えでは履歴を取得しません。

現在のセッションモデルと一致しない古いイベントや、チェーン外のモデルでは切り替えません。
切り替えに成功した場合だけ次のモデルへ進み、チェーンの末尾で停止します。
OpenCode の `decision.retry` は変更しないため、次の生成を開始するかどうかは OpenCode が決めます。

## 開発

```sh
cd packages/opencode-model-fallback
npm test
npm pack --dry-run
```

```text
opencode-model-fallback/
├── plugin.js          # 公開エントリーポイント
├── src/               # プラグイン実装
│   ├── plugin.js      # OpenCode フックと I/O
│   ├── failures.js    # エラー分類
│   ├── models.js      # モデルの解析・比較・切り替え先への変換
│   └── policy.js      # 副作用のない状態遷移
├── tests/             # 分類・状態遷移・フックのテスト
├── chains.nix         # この dotfiles 用のモデル設定と検証
├── default.nix        # Nix 用エントリーポイントの生成
├── package.json
└── README.md
```

| ファイル・ディレクトリ | 責務 |
| --- | --- |
| `plugin.js` | `createModelFallbackPlugin` を公開する入口 |
| `src/plugin.js` | OpenCode フックの登録・セッション状態の保持・I/O |
| `src/failures.js` | エラーの分類、既知の上限コード・文言 |
| `src/models.js` | モデルの解析・比較・切り替え先への変換 |
| `src/policy.js` | 副作用のない状態遷移 |
| `tests/` | 分類・状態遷移・公開入口経由のフックをそれぞれ検証 |
| `chains.nix` | この dotfiles 用のモデル設定と検証 |
| `default.nix` | 設定を渡す Nix 用エントリーポイントの生成 |

Nix はソースディレクトリをストアへ配置し、`createModelFallbackPlugin` を呼び出すエントリーポイントだけを生成します。
JavaScript ソースの連結やプレースホルダーの置換は不要です。
Nix 側の生成物は `result/home-files/.config/opencode/plugins/model-fallback.js` で確認できます。

`package.json` では公開 API と梱包するファイルを定義しています。実行コードは `plugin.js` と `src/`、テストは `tests/` に分け、梱包対象からテストと Nix 設定を除外しています。
現在は公開準備のため `private: true` とし、公開前にパッケージ名・ライセンス・バージョン・対応する OpenCode API を確定してください。
