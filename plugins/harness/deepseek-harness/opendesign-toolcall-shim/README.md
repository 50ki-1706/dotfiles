# opendesign tool-call shim

opendesign ゲートウェイは、並列に出した最初の 2 つの tool call に同じ `index` を付けることがあります
([nexu-io/open-design#9369](https://github.com/nexu-io/open-design/issues/9369))。
pi-ai は `index` で組み立てるため、2 つの引数 JSON が `{"a":1}{"b":2}` のように連結されます。
dsh はこれを不正な引数として扱い、`MALFORMED_RESPONSE` でターン全体を中断します
([deepseek-ai/deepseek-harness#7581](https://github.com/deepseek-ai/deepseek-harness/issues/7581),
[#8976](https://github.com/deepseek-ai/deepseek-harness/issues/8976))。

このプラグインは、provider 側またはハーネス側が直るまでの**一時的な回避策**です。

## 対応内容

1. **ワイヤ層 (`wire/`)**: pi-ai に渡す前の SSE で、新しい `id` の tool call に空いている `index` を割り当て直します。
2. **組み立て層 (`stream/`)**: tool call を `index` ではなく `id` で組み立てます。完成した引数が不正でも `MALFORMED_RESPONSE` は投げず、生テキストを残します。ツールが `INVALID_ARGS` を返し、モデルが自己修正できます。
3. **ガード (`guard/`)**: `tools/pre-execute` で、不正な引数だけを対象にします。連結された JSON なら先頭の 1 件を採用し、途中で切れた JSON なら閉じて修復します。どちらもできなければ何もしません。呼び出しを拒否・取り消しはしません。

`retryPolicy` は変更しません。shim は `MALFORMED_RESPONSE` を発生させないため、再試行対象に加える必要がありません。

## 適用範囲

- shim が扱うのは `opendesign` ルートだけです。他のルート（mistral など）は stock の `PiAiAdapter` のまま動きます。
- 既定では、どのプロファイルにも入りません。`plugins/cli/dsh-tui/default.nix` の `dshOpendesignToolcallShim.profiles = [ "dsh-tui" ]` で選んだプロファイルにだけ入ります。存在しないプロファイルは activation がスキップします。
- shim の行は config を持たないため、接続先はプロファイルの `cordis.patch.yml` に書きます。同じ行で他のルートも宣言します。stock 行を置き換えるため、宣言しないルートは使えなくなります。

```yaml
- id: llm-pi-ai
  name: dsh-opendesign-toolcall-shim
  config:
    providers:
      opendesign:
        displayName: opendesign
        apiKeyEnv: OPENDESIGN_API_KEY
        api: openai-completions
        baseURL: https://amr-link.open-design.ai/v1
        models:
          - id: deepseek-v4.1-flash
            name: deepseek-v4.1-flash
      mistral:
        apiKeyEnv: MISTRAL_API_KEY
        models:
          - id: deepseek-v4-1-flash-1017
            name: deepseek-v4-1-flash-1017
```

## ビルドとテスト

- `src/` は TypeScript です。`tsrs -p tsconfig.json` で `dist/` にコンパイルし、`dist/` をコミットします。dsh はプラグインを `node_modules` 配下に置き、そこでは Node が型の剥がしを拒否するためです。
- `run-tests.sh` は、合成 SSE を返すローカル HTTP サーバに対して実際のアダプタを動かします。ネットワークは使いません。

## 取り外し

provider 側 (#9369) またはハーネス側 (#7581) が直ったら、次の 2 つを消します。

1. `plugins/harness/deepseek-harness/default.nix` の `./opendesign-toolcall-shim` の import
2. `dshOpendesignToolcallShim.profiles` の指定

Home Manager を適用すると、プロファイルから bundle が外れ、stock のアダプタが `opendesign` を含む全ルートを担当します。プロファイルの `providers.opendesign` は通常のルート設定なので残してかまいません。
