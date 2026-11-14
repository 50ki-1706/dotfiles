# publish

`/publish` は、作業中の変更を hunk 単位で commit し、push と PR 作成まで進めるコマンドです。
このディレクトリは、そのハーネス非依存のコアと、ハーネスごとのアダプタを npm workspaces でまとめています。

```
publish/
├── core/              @publish/core — ハーネスを知らない検証と操作の本体
├── dsh-adapter/       dsh-publish — DeepSeek Harness 用
├── codex-adapter/     @publish/codex-adapter — Codex CLI 用（MCP サーバー）
└── opencode-adapter/  @publish/opencode-adapter — OpenCode 用
```

## コアとアダプタの境界

コアは `PublishHost` という 6 つの操作だけをハーネスに求めます。

| 操作 | 役割 |
| --- | --- |
| `authorize(action, resources, { call })` | 承認を求める。`call` があれば tool call に紐づく |
| `directory(sessionID)` | セッションの作業ディレクトリ |
| `skills(directory)` | ハーネスのスキルカタログ |
| `deliver(sessionID, prompt)` | `/publish` の指示文と必須スキルをモデルへ届ける |
| `reloadTools()` | テンプレート固有の `publish_pr` スキーマを反映する |
| `observeApproval(listener)` | 承認が決まる前に観測し、決定を差し替える |

アダプタは、この 6 操作をそのハーネスの API で実装し、`mountPublish` を呼ぶだけです。ツール・検証・失敗報告・承認の照合はコアが持つので、アダプタに重複はありません。

## アダプタの差分

3 つのアダプタは同じコアを使いますが、ハーネスの表現力が違うため、次の点で振る舞いが分かれます。

| 観点 | dsh-adapter | codex-adapter | opencode-adapter |
| --- | --- | --- | --- |
| 公開形態 | DSH の bundle（`dsh-publish`） | MCP サーバー（`publish-mcp`） | OpenCode の plugin（`publish.js`） |
| `/publish` | スラッシュコマンド | MCP の prompt のみ。Codex がそれを拾うかは未確認 | スラッシュコマンド |
| 承認の観測 | `approval/request` の waterfall | 観測なし。Codex が承認を決めてから届く | `permission.hook('evaluate')` |
| fast-forward 昇格 | `ask` を表現できないため**拒否**する | 不可逆操作を**サーバー側で拒否**する | `effect = 'ask'` に**昇格**する |
| merge（`publish_sync_main`） | 実行されない | `PUBLISH_MCP_ALLOW_UNATTENDED=1` のときだけ実行 | 人間の確認を挟んで実行 |
| スキル | 同梱の本文と照合する | 照合しない（Codex のカタログに任せる） | ランタイムのカタログを、同梱の本文と照合する |
| 作業ディレクトリ | セッションの `workingDirectory` | `roots/list` の先頭、無ければ cwd | セッションの `location.directory` |
| admission | `/publish` で行う | 最初のツール呼び出しで行う（workspace が変われば再実行） | `/publish` で行う |

### 承認の扱いが分かれる理由

コアは fast-forward merge の承認を「`ask` に昇格させる」ことで求めます。`ask` は「自動許可を止めて人間に聞け」という指示です。

- **OpenCode** は evaluate イベントの `effect` を書き換えられるので、`ask` をそのまま表現できます。
- **dsh** は waterfall が返せる結果が `allowed-once` / `rejected` / `cancelled` / `unavailable` だけで、「人間に聞け」を表す値がありません。委譲すると通常の ask と区別できないため、昇格した要求は拒否しています。その結果、dsh では merge が実行できません。
- **Codex** は tool 呼び出しの可否を、サーバーに届く前に Codex 自身が決めます。サーバーから人間に聞く経路がないため、不可逆操作（merge・push・PR 作成）は `PUBLISH_MCP_ALLOW_UNATTENDED=1` が無い限り拒否します。このオプトインを使うときは、Codex 側の approval policy で MCP tool 呼び出しに承認を要求してください。

### スキル検証の扱い

`verifyRequiredSkills` は、必須スキルが信頼できるパスにあり、本文が同梱のものと一致するかを確認します。dsh と OpenCode はスキルを同梱の `official-skill.md` / `pr-skill.md` と照合します。Codex は同梱のスキルファイルを持たず、スキルは Codex のカタログから解決されるため、この照合は行いません。

## ビルドとテスト

各パッケージは TypeScript で書かれており、`dist/` にコンパイル結果をコミットします。dsh と OpenCode は、プラグインを `node_modules` 配下から読み込み、そこでは Node が型の剥がしを拒否するためです。

```sh
cd plugins/harness/publish
npx tsc -b            # 全パッケージをビルド
./run-tests.sh        # ビルド、テスト、dist/ の drift 検出
```

`run-tests.sh` は `tsc -b --force` の後に `dist/` に差分が無いことを確認します。差分があれば、`dist/` を更新してからコミットしてください。一時的に省くには `PUBLISH_SKIP_DIST_CHECK=1` を指定します。

dsh-adapter のテストは、実行中の dsh の `node_modules` を必要とします。`DSH_INSTALL_MODULES` で指定するか、`dsh` を PATH に通してください。

## Nix への組み込み

- **dsh**: `plugins/harness/deepseek-harness/publish/default.nix`。`dshPublish.profiles` で対象プロファイルを選びます。
- **OpenCode**: `plugins/cli/opencode/home.nix`。`publish.js` として配置します。
- **Codex**: `plugins/cli/codex/publish-mcp/`。`publish-mcp` を `home.packages` に入れます。`~/.codex/config.toml` は Codex が生成するファイルなので、次の 1 行は手で追加してください。

```toml
[mcp_servers.publish]
command = "/Users/koki/.nix-profile/bin/publish-mcp"
```

## 既知の制限

- Codex 版は `/publish` のスラッシュコマンドを持たず、指示文は MCP の prompt として出します。
- Codex CLI は nixpkgs の 0.166.0 を使います（Homebrew cask は 0.167.0）。
- 実 GitHub への push と PR 作成は、ローカルの bare remote と `gh` のスタブに対するテストでのみ検証しています。
