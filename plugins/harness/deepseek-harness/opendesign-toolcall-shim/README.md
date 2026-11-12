# opendesign tool-call shim — 適用手順と検証結果

opendesign ゲートウェイの tool_calls index 衝突 (nexu-io/open-design#9369) と、
それに続く MALFORMED_RESPONSE によるターン中断
(deepseek-ai/deepseek-harness#7581, #8976) を dsh 側で吸収する**一時的な**
プラグイン。provider 側またはハーネス側の対応が入ったら取り外す。

## 置き場所

`plugins/harness/deepseek-harness/opendesign-toolcall-shim/` — ハーネス plugin の子。

`plugins/` は `app`（GUI アプリ）/ `cli`（CLI クライアント）/ `harness`（dsh 本体と
その拡張）/ `tool`（shell・fonts など）に分かれる。dsh はハーネスであり、
desktop / web / dsh-tui / headless / ACP の各クライアントが共有する土台なので、
`cli` ではなく `harness` に置く。

`cli` の子や dsh-tui の子にしない理由:

- **クライアント非依存の修正**。壊れるのは pi-ai アダプタの tool_calls 組み立て
  なので、どのクライアントでも同じように起きる。dsh-tui の子にすると、dsh-tui を
  使わないクライアントには原理的に届かない。
- **`core` にはしない**。これは一時的な応急処置で、provider かハーネスが直れば
  消えるもの。恒久的な core に混ぜると取り外しが難しくなる。
- **dsh-tui から独立**。以前は `plugins/cli/dsh-tui/` の子で、dsh-tui の pnpm
  モジュールを `imports` していたため、shim 単体を取り外すと dsh-tui の
  profile 宣言まで消える構造だった。今は `dshOpendesignToolcallShim.profiles`
  で対象を選ぶだけなので、取り外しは import 1 行。

### 対象プロファイルの選択

既定では**どのプロファイルにも入らない** (opt-in)。`plugins/cli/dsh-tui/default.nix`
が選んでいるのは `dsh-tui` だけ:

```nix
dshOpendesignToolcallShim.profiles = [ "dsh-tui" ];
```

desktop / web を対象にする場合は、それぞれの管理元 (現状は Home Manager 管理外の
手動構成) で同じ 1 行を足すか、`dshOpendesignToolcallShim.profiles` に
追加する。存在しないプロファイルは activation が警告してスキップするので、
手動管理の構成を壊さない。

## 構成

```
plugins/harness/deepseek-harness/
├── default.nix                      # ./opendesign-toolcall-shim を import (取り外し点)
└── opendesign-toolcall-shim/
    ├── package.json                 # dsh bundle 宣言 (main = dist/index.js)
    ├── tsconfig.json                # tsrs のビルド設定
    ├── cordis.patch.yml             # 2 行 (アダプタ差し替え / guard) + 経緯
    ├── default.nix                  # 対象プロファイルへ配置する activation (opt-in)
    ├── run-tests.sh                 # ビルド + オフラインテスト
    ├── src/                         # TypeScript のソース (保守対象)
    │   ├── index.ts                 # プラグイン入口 (role で 2 行を振り分け)
    │   ├── json/                    # 純粋な JSON 層 (harness 型に依存しない)
    │   │   ├── values.ts            # 型と述語 (JsonObject, parseJsonObject)
    │   │   ├── scan.ts              # 文字列/深さを追う唯一の走査
    │   │   ├── split.ts             # 連結 JSON の境界検出と分割
    │   │   ├── repair.ts            # 切断・破損 JSON の修復
    │   │   └── diagnose.ts          # モデル向けの失敗説明
    │   ├── wire/                    # ネットワーク層 (index 衝突の解消)
    │   │   ├── chunk.ts             # ワイヤ形式の読み取り
    │   │   ├── index-rewriter.ts    # index の再割り当て
    │   │   ├── sse.ts               # SSE フレーミング
    │   │   └── fetch.ts             # pi-ai に渡す fetch の組み立て
    │   ├── stream/                  # harness ストリームプロトコルへの変換
    │   │   ├── calls.ts             # id キーの呼び出し追跡
    │   │   ├── assembler.ts         # pi-ai イベント → chunk
    │   │   └── terminal.ts          # usage / finish のマッピング
    │   ├── adapter/                 # opendesign 用アダプタ
    │   │   ├── route.ts             # ルート設定の読み取り
    │   │   ├── credentials.ts       # 資格情報の解決
    │   │   ├── headers.ts           # リクエストヘッダ
    │   │   ├── stream.ts            # ストリーム 1 本分のパイプライン
    │   │   ├── id-keyed.ts          # IdKeyedPiAiAdapter 本体
    │   │   └── route-split.ts       # ルート振り分け
    │   ├── guard/                   # tools/pre-execute の advisory ガード
    │   │   ├── inspect.ts           # 引数ごとの判断
    │   │   └── effect.ts            # リスナー登録
    │   └── plugin/                  # 2 行それぞれのマウント
    │       ├── config.ts            # role と既定値
    │       ├── adapter-role.ts      # アダプタ行
    │       └── guard-role.ts        # ガード行
    ├── dist/                        # src/ のコンパイル結果 (コミット対象)
    └── tests/
        ├── acceptance.test.ts       # 受け入れケース (実 HTTP 経由)
        ├── json.test.ts             # json/ の単体
        ├── wire.test.ts             # wire/ の単体
        ├── stream.test.ts           # stream/ の単体
        ├── guard.test.ts            # guard/ の単体
        ├── scope.test.ts            # スコープ・同梱物・ルート振り分け
        ├── build.test.ts            # 型チェック
        ├── helpers/                 # 共有フィクスチャ
        └── link-dsh-modules.ts      # テスト用のモジュール解決
```

層の分け方は「取り外しやすさ」に合わせている。`json/` は harness 型にも I/O にも
依存しない純粋関数だけで、provider かハーネスが直った後もそのまま残せる。逆に
`plugin/` は 2 行のマウントだけを持ち、ここを消せば shim 全体が外れる。

### TypeScript とビルド

ソースは TypeScript で書き、`tsrs` (Rust 製の tsc) で `dist/` にコンパイルする。

```sh
tsrs -p tsconfig.json            # ビルド
tsrs -p tsconfig.json --noEmit   # 型チェックのみ
```

`dist/` はコミットする。dsh はプロファイルのプラグインを `node_modules` 配下に
置くが、Node はそこで型剥がしを拒否する
(`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`)。生の `.ts` を `main` にすると
起動時に import が失敗するため、コンパイル済みの `.js` を同梱する。
`tsconfig.json` の `strict` / `noUncheckedIndexedAccess` /
`exactOptionalPropertyTypes` を有効にしてあり、テストは型チェックも実行する。

### 何をしているか

1. **ワイヤ層 (`wire/`)** — pi-ai は `delta.tool_calls[]` を `index` 優先で
   組み立てるため、衝突は pi-ai より手前で解消する必要がある。pi-ai の `fetch`
   オプションに SSE 書き換えを挿し、新しい id を持つ呼び出しには空いている
   index を割り当てる。これで pi-ai のイベント自体が正しくなり、下流は無変更。
2. **組み立て層 (`stream/`)** — イベントを id で畳み、harness のストリーム
   プロトコルに変換する。引数の厳密検証で `MALFORMED_RESPONSE` を投げず、生テキストを
   `block-end` に載せる (ツール層が INVALID_ARGS を返し、モデルが自己修正できる)。
3. **ガード (`guard/`)** — `tools/pre-execute` で、パースできなかった引数だけを対象に
   連結 JSON の分割と部分 JSON の修復を試す。どちらも失敗したら手を出さず、
   ツールの INVALID_ARGS に委ねる。deny も cancel もしない。
4. **JSON 層 (`json/`)** — 上の 2 と 3 が使う純粋関数。文字列状態と深さを追う走査は
   `scan.ts` の 1 か所だけにあり、分割・修復・診断が同じエスケープ規則を共有する。

`retryPolicy` は変更しない。shim は `MALFORMED_RESPONSE` を発生させない
(2 の advisory 化) ため、再試行対象に加える必要がない。

### スコープ

アダプタ行の id を再利用して stock 行を**置き換える**ため、その行が持っていた
全ルートを引き受ける必要がある。`RouteSplittingAdapter` が
`opendesign` だけを `IdKeyedPiAiAdapter` に、それ以外 (mistral など) を stock の
`PiAiAdapter` に振り分ける。deepseek-official は別アダプタなので無関係。

## 適用

`plugins/harness/deepseek-harness/default.nix` が `./opendesign-toolcall-shim` を
import し、`plugins/cli/dsh-tui/default.nix` が対象プロファイルを選んでいる。
Home Manager を適用すると、選んだプロファイルへ次が行われる:

- `~/.dsh/profiles/<name>/node_modules/dsh-opendesign-toolcall-shim/` に実体を配置
  (symlink だと dsh loader が package.json を解決できない)
- プロファイルの `package.json` の `dsh.profile.bundles` に
  `dsh-opendesign-toolcall-shim` を追加 (冪等)

```sh
cd /Users/koki/.dotfiles
nix run home-manager -- build --flake .#koki          # 確認
sudo darwin-rebuild switch --flake .#mac              # 反映
```

### プロファイル側の YAML

`~/.dsh/profiles/dsh-tui/cordis.patch.yml` に `providers` を置く (既存の
mistral などはそのまま残す)。shim の行は config を持たないので、ルート宣言は
プロファイル側に置く:

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
          - id: deepseek-v4.1-flash-eco
            name: deepseek-v4.1-flash-eco
      mistral:
        apiKeyEnv: MISTRAL_API_KEY
        models:
          - id: deepseek-v4-1-flash-1017
            name: deepseek-v4-1-flash-1017
- id: opendesign-toolcall-guard
  name: dsh-opendesign-toolcall-shim
  config:
    role: guard
    provider: opendesign
```

`providers` は stock のアダプタ行と同じ設定名前空間なので、この行の config が
そのままプロファイルの `providers` 文書になる。

## 取り外し

provider 側 (#9369) またはハーネス側 (#7581) の対応が入ったら:

1. `plugins/harness/deepseek-harness/default.nix` から
   `./opendesign-toolcall-shim` の行を消す (対象選択の
   `dshOpendesignToolcallShim.profiles` も一緒に消す)。
2. Home Manager を適用する。

これで bundle がプロファイルの一覧から外れ、2 行とも消え、stock のアダプタが
元どおり opendesign を含む全ルートを持つ。プロファイル側の
`providers.opendesign` は通常のルート設定なので残してよい。

## 検証

### ユニットテスト (オフライン)

```sh
plugins/harness/deepseek-harness/opendesign-toolcall-shim/run-tests.sh
```

`tsrs` があればビルドしてから実行する。合成 SSE を返すローカル HTTP サーバで
実際のアダプタを駆動する。ネットワーク不要。テストは層ごとに 1 ファイル。

| ケース | 内容 | 結果 |
| --- | --- | --- |
| 1 | index が重複し id が別個の 3 呼び出し → 3 つの別呼び出しになる | 合格 |
| 2 | 引数が 2 オブジェクト連結 → 分割復元され、ターンは継続 | 合格 |
| 3 | 引数が途中で切断 → MALFORMED_RESPONSE で中断しない | 合格 |
| 3b | 修復不能な引数 → 生テキストのまま INVALID_ARGS に委ねる | 合格 |
| 4 | 正常な tool call → usage → finish が従来と同一 | 合格 |
| 4b | 分割された引数 delta が 1 呼び出しに集約 | 合格 |
| 4c | テキストのみの応答が従来と同一 | 合格 |
| — | **回帰**: stock アダプタは同じストリームで MALFORMED_RESPONSE を投げる | 合格 |
| — | ルート振り分け: opendesign のみ shim、他は stock | 合格 |
| — | 同梱物がコンパイル済み .js で、src と対応していること | 合格 |
| — | 型チェックが通ること (tsrs がある場合) | 合格 |

52 テスト全件合格 (受け入れ 7 / json 16 / wire 6 / stream 7 / guard 11 /
scope 4 / build 1)。

### dsh 0.2.2-rc.1 へのビルドとロード

nix ビルドで生成された実体をプロファイルへ配置し、dsh を起動して確認:

| 確認項目 | 結果 |
| --- | --- |
| プラグインの import / 行の activate | 合格 (両行 state=2) |
| opendesign のアダプタ | `IdKeyedPiAiAdapter` |
| mistral のアダプタ | `PiAiAdapter` (stock) |
| deepseek-official のアダプタ | `DeepSeekAdapter` (stock) |
| opendesign の retryableCodes | 5 既定 (変更なし) |
| mistral の retryableCodes | 5 既定 (変更なし) |
| guard のリスナー登録 | 合格 (fiber 101) |
| 実 HTTP 経由の衝突ストリーム | 3 呼び出しに分離 |

### nix 検証 (`/Users/koki/.dotfiles`, branch `main`)

| コマンド | 終了コード |
| --- | --- |
| `nix fmt` | 0 (0 changed) |
| `nix run home-manager -- build --flake .#koki` | 0 |
| `nix build .#darwinConfigurations.mac.system --out-link result-darwin` | 0 |
| `nix build .#checks.aarch64-darwin.plugin-composition --no-link` | 0 |

## 改変したファイル

新規 (すべて `plugins/harness/deepseek-harness/opendesign-toolcall-shim/` 配下):

- `package.json`, `tsconfig.json`, `cordis.patch.yml`, `default.nix`,
  `run-tests.sh`, `README.md`, `.gitignore`
- `src/index.ts`, `src/plugin/{config,adapter-role,guard-role}.ts`
- `src/json/{values,scan,split,repair,diagnose,index}.ts`
- `src/wire/{chunk,index-rewriter,sse,fetch,index}.ts`
- `src/stream/{calls,assembler,terminal,index}.ts`
- `src/adapter/{route,credentials,headers,stream,id-keyed,route-split,index}.ts`
- `src/guard/{inspect,effect,index}.ts`
- `dist/**/*.js` (ビルド成果物、`src/` と 1 対 1)
- `tests/{acceptance,json,wire,stream,guard,scope,build}.test.ts`,
  `tests/helpers/{server,wire,drive,pi-events}.ts`, `tests/link-dsh-modules.ts`

変更:

- `plugins/harness/default.nix` — 新設 (ハーネス分類)
- `plugins/harness/deepseek-harness/default.nix` — import 1 行追加
- `plugins/cli/dsh-tui/default.nix` — 対象プロファイルの選択 1 行
- `tests/plugins.nix` — opt-in 既定と選択のテスト 3 件

`/nix/store` 配下は一切変更していない。
