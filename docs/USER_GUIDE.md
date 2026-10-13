# ユーザーガイド

このガイドでは、Nix と Home Manager で構成された本リポジトリの構造、設定の適用方法、OpenCode エージェントハーネスの考え方を説明します。パスは、特に断りがない限りリポジトリのルートからの相対パスです。

## 1. はじめに

このリポジトリは、Nix で管理される dotfiles リポジトリです。シェル、エディタ、ターミナル、Git、SSH、CLI ツールなどの設定を、Nix の宣言的な構成として管理します。

Home Manager を設定の中心に置き、`home.nix` を入口として各モジュールを読み込みます。設定を一元管理することで、同じ構成を再適用しやすくし、設定ファイルの配置とパッケージの導入を同じワークフローで扱えます。

また、本リポジトリには OpenCode エージェントハーネスが含まれています。エージェントの役割、プロンプト、権限、スキルを分離し、Nix の関数で重複を減らしながら、調査・計画・実装・検証を安全に分担できるように設計されています。

本リポジトリ全体を通じて、最小サイズを保つことを意識しています。不要なファイルや重複する設定を追加せず、既存の仕組みで代替できないかを常に検討します。これは OpenCode エージェントハーネスの設計思想だけでなく、Nix 設定、スクリプト、ドキュメント全体に適用される原則です。

## 2. ディレクトリ構造

| ディレクトリ | 目的 |
| --- | --- |
| `home.nix` | Home Manager 設定の入口です。`modules/` と `hosts/` を明示的に読み込みます。 |
| `modules/` | ツールごとの Home Manager モジュールと、配置する生の設定ファイルを管理します。OpenCode のエージェント設定、プロンプトも含みます。 |
| `hosts/` | ホストやプラットフォーム固有の設定を管理します。 |
| `packages/` | Nix パッケージ定義と SSH キー管理用の定義を管理します。 |
| `scripts/` | Nix の導入、初期セットアップ、旧シンボリックリンクの移行などのセットアップスクリプトを管理します。 |
| `skills/` | OpenCode およびエージェントが利用するスキル定義を集約します（リポジトリ固有スキルは `.agents/skills/` 配下）。 |
| `docs/` | リポジトリの構成や運用に関するドキュメントを管理します。 |

## 3. Home Manager の設定

### 3.1 入口とモジュールの読み込み

Home Manager の入口は `home.nix` です。主なモジュールを次のように読み込みます。

```nix
imports = [
  ./modules/cli.nix
  ./modules/mise.nix
  ./modules/gh.nix
  ./modules/ssh.nix
  ./modules/fonts.nix
  ./modules/helix.nix
  ./modules/ghostty.nix
  ./modules/zellij
  ./modules/git
  ./modules/shell
  ./modules/vscode
  ./modules/opencode
  ./modules/skills.nix
  ./hosts
];
```

各モジュールの責務は次のとおりです。

| モジュール | 主な責務 |
| --- | --- |
| `modules/cli.nix` | `home.packages` に導入する CLI ツールを定義します。 |
| `modules/mise.nix` | mise の有効化と Zsh 連携のみを定義します。グローバル設定 `~/.config/mise/config.toml` は廃止済みで、グローバル CLI ツールは Nix 管理です。プロジェクト単位の `.mise.toml` によるピン留めは可能です。 |
| `modules/gh.nix` | GitHub CLI の有効化と SSH プロトコル設定を定義します。 |
| `modules/ssh.nix` | SSH の設定を定義します。 |
| `modules/fonts.nix` | フォントと fontconfig の設定を定義します。 |
| `modules/helix.nix` | Helix エディタの設定を定義します。 |
| `modules/ghostty.nix` | Ghostty の設定を定義します。 |
| `modules/zellij/` | Zellij のパッケージ、レイアウト、キーバインド設定を定義します。 |
| `modules/git/` | Git の設定と Git 用の生設定ファイルの配置を定義します。 |
| `modules/shell/` | Zsh とシェルエイリアスの設定を定義します。 |
| `modules/vscode/` | VS Code の設定ファイルの配置を定義します。 |
| `modules/opencode/` | OpenCode のパッケージ、エージェント設定、プロンプト、プラグイン配置を定義します。 |
| `modules/skills.nix` | グローバルスキルの配置を定義します。 |
| `hosts/` | ホスト固有の設定の入口です。必要に応じて `isDarwin` などの条件付きモジュールを追加します。 |

### 3.2 設定の適用

リポジトリのルートで、次のコマンドを実行します。

```sh
nix run home-manager -- switch --flake .#koki
```

このコマンドは、flake の `homeConfigurations."koki"` を対象に Home Manager の設定をビルドし、現在のユーザー環境へ適用します。Nix コードを変更した場合は、変更内容を確認したうえでこのコマンドを実行してください。

### 3.3 主な機能

- `programs.opencode` を有効にし、`packages/opencode.nix` で固定した公式npm配布のOpenCode v2（Apple Silicon向け）と `modules/opencode/opencode.nix` の設定を Home Manager から適用します。本体の更新は、このパッケージ定義のバージョンとハッシュを変更します。
- `home.file.".agents/skills"` と `mkOutOfStoreSymlink` を使い、リポジトリの `skills/` を `~/.agents/skills` から参照できるようにします。
- `home.file` を使い、OpenCode 用のファイルを `~/.config/opencode/` 以下へ配置します。具体的な配置は [4.4 ファイル配置](#44-ファイル配置) に示します。

`mkOutOfStoreSymlink` は Nix store 内のコピーではなく、リポジトリを直接参照するリンクを作るための仕組みです。そのため、`skills/` 内の編集は、構築済みのリンクを通じてグローバルスキル側へ反映されます。

## 4. OpenCode エージェントハーネス（核心セクション）

OpenCode の設定は、単一の大きなプロンプトにすべてを詰め込むのではなく、エージェント、プロンプト、権限、スキル、配置ファイルに分割されています。これにより、必要な情報だけを必要なエージェントへ渡し、調査と実装の境界を保ちます。

### 4.1 設計思想

#### コンテキスト最小化の原則

エージェントへ一度に大量のリポジトリ情報を与えるのではなく、各ディレクトリに小さな `AGENTS.md` をポインターとして配置する方針です。

- エージェントは、作業対象のディレクトリにある `AGENTS.md` を、必要になった時だけ読み込みます。
- ディレクトリごとの目的、境界、運用ルールを局所化し、無関係な設定をコンテキストへ混ぜません。
- ルートの `AGENTS.md` にはディレクトリ一覧の表を置き、対象ディレクトリの `AGENTS.md` へ誘導します。エージェントは、最初から全ファイルを読むのではなく、ポインターを辿って必要な情報だけを取得できます。

この方法は、プロンプトの長さを抑えるだけでなく、変更の影響範囲をディレクトリ単位で理解しやすくするための設計でもあります。

#### 組み込み機能と Nix 宣言

エージェントは `modules/opencode/agents.nix` の `agents` に OpenCode v2 の構造で宣言します。`opencode.nix` はこれを import し、コマンド・MCP などの設定と結合します。Home Manager が最終的な JSON を生成します。モデル設定と順序付きの `permissions` は Nix に集約し、独自エージェントの `system` は `prompts/` の Markdown を `builtins.readFile` で読み込みます。YAML フロントマターは使いません。読み取り制限とスキル許可は、共通ガードブロックとケーパビリティオプションで表現します。

組み込みの `general` はモデルと権限だけを調整し、標準動作を引き継ぎます。`explore` は組み込み subagent の `mode`、`description`、`system` を上書きし、深い調査（外部調査、アーキテクチャ理解、徹底したコードベース調査）専用にしています。浅い調査は `spec` が自身で行います。作業固有の制約、調査の深さ、成果物、検証方法は `spec` が委譲時に渡します。拡張が必要なときも、まず既存の組み込みエージェントで対応できるかを確認します。

#### 権限の管理

v2 の `permissions` は `action`、`resource`、`effect` の順序付き配列で、最後に一致したルールが優先されます。同じ action の最後の一致が `resource: "*"` の `deny` になると、そのツールはプロバイダーへのリクエストから丸ごと除外されます（Zen の無料モデルでは 403 を招きます）。そのため `shell`・`read`・`glob`・`grep` は、各エージェントで最後の一致がスコープ付きルール（ガードや個別 allow）になるように構成しています。

権限は `modules/opencode/permissions.nix` の `mkPermissions` に集約し、`agents.nix` では action ごとのケーパビリティで指定します。インターフェースは次のとおりです。

- 必須: `shell`、`read`、`glob`、`grep`、`edit`、`question`、`externalDirectory`、`webfetch`、`websearch`、`opencodeTools`（指定漏れは評価エラー）。
- 省略可能（既定 `"deny"`）: `subagent`、`skill`、`execute`、`graphify`、`chromeDevtools`。
- 値: `"allow"`、`"deny"`、`"inherit"`。`shell` と `read` だけは `"guarded"` も受け付けます。
- `subagent` と `skill` は許可名の非空リストも受け取ります（`"allow"` は指定できません）。

各値の意味は次のとおりです。

- `"allow"`: ワイルドカードの `{ action, "*", "allow" }` を出します。`shell`/`read` では直後に共通ガードが続きます。`opencodeTools`/`graphify`/`chromeDevtools` ではワイルドカード allow を出さず、`actions.nix` に列挙した既知ツールの完全名だけを allow します（closed-world）。
- `"guarded"`: ガードのみを出し、ワイルドカード allow を出しません（`shell`/`read` のみ）。露出と実行制約だけを課し、許可は blanket deny や基盤レイヤの扱いに委ねます。
- `"deny"`: `{ action, "*", "deny" }` を出します（MCP 系はワイルドカード deny）。
- `"inherit"`: 何も出さず、`denyAll` の blanket deny または基盤・グローバル定義に従います。

`read` に `"allow"`/`"guarded"` を指定したプロファイルには、OpenCode 組み込み既定と同じ `{ read, "*.env", "ask" }`、`{ read, "*.env.*", "ask" }`、`{ read, "*.env.example", "allow" }` を共通ガードの先頭で再掲します（R1′）。これにより、ワイルドカード allow が組み込みの ask を上書きせず、`config.env` のようなファイルは `ask` のままです。続く `secretReadGuards`（`.env`、`*.key`、`*.pem`、`id_rsa*` など）は具体的な deny を最後に置くため、`config.env.private.key` のような重なりは deny に解決します。R1′ により `spec` と `plan_review` は `config.env` 系が allow から ask へ引き締められ、`general` と `explore` は組み込み既定の ask が復元されました。

共通ガードは全プロファイルに埋め込まれ、危険なコマンドの拒否・push や switch 前の確認・機密ファイルの読み取り制限を維持します。シェルの拒否パターンは完全なサンドボックスではありません。

| エージェント | ファイル・シェル | MCP | スキル | 委譲 |
| --- | --- | --- | --- | --- |
| `spec` | 読み取り・シェルを許可（blanket deny 上のワイルドカード allow）、編集は拒否 | Graphify（完全名のみ） | 5 グローバル + リポジトリ固有（project 側で宣言） | `explore`、`general`、`plan_review` のみ |
| `general` | 組み込みの実装権限 + 共通制限。外部ディレクトリは拒否 | Graphify / Chrome DevTools（完全名のみ） | 5 グローバル（リポジトリ固有スキルは closed-world により対象外） | 拒否 |
| `explore` | 読み取り専用（シェルは guarded） | Graphify（完全名のみ） | 拒否 | 拒否 |
| `plan_review` | 読み取り + guarded シェル。編集・質問は拒否 | Graphify（完全名のみ） | 拒否 | 拒否 |

グローバルなスキルの許可対象は `gh-cli`、`computer-use`、`orca-cli`、`orchestration`、`playwright-cli` です。このリポジトリの `opencode.json` は `nix-verify` と `minimal-repository` を追加で許可し、`spec` がリポジトリ固有の手順を利用できます。`general` は closed-world 化によりリポジトリ固有スキルの許可対象外になりました（R2′）。エージェント配列の `{ skill, "*", "deny" }` と名前 allow が project オーバーレイより後に適用されるためです。スキルは `SKILL.md` をパスとして読むだけなので、許可外スキルもファイルとしては存在し、読み取りは `read` 権限に従います。

### 4.2 エージェント構成

| エージェント | 区分 | モデル | 役割 |
| --- | --- | --- | --- |
| `spec` | 独自 primary（既定） | `opencode-go/qwen3.8-flash#medium` | 日本語での対話、計画、ユーザー確認、委譲 |
| `general` | 組み込み subagent | `opencode-go/deepseek-v4.1-flash#max` | 実装・検証・承認済みのアーキテクチャ文書更新 |
| `explore` | 組み込み subagent | `opencode/step-5-preview-free#high` | 深い調査（外部調査、アーキテクチャ理解、徹底したコードベース調査） |
| `plan_review` | 独自 subagent | `openai/gpt-6-luna#max` | 計画・設計相談・重要な実装変更のレビュー |

`spec → explore / plan_review → ユーザー確認 → general` を基本とし、重要な変更は実装後にも `plan_review` で確認します。組み込みの `build` と `plan` はそのまま利用できます。旧 `executer` は `general`、旧 `deep_explore` と `internet_search` は `explore` に統合しました。

サブエージェントからの再委譲は行いません。文書更新を計画に含めて承認された場合にのみ、`spec` が `general` へ直接依頼します。

### 4.3 設定ファイル

| ファイル | 役割 |
| --- | --- |
| `modules/opencode/agents.nix` | v2 のエージェント宣言、利用モデル、権限・プロンプト・プロバイダー設定の読み込み |
| `modules/opencode/actions.nix` | action 空間の単一情報源。`builtinPairs`（出典付き）、完全名の MCP allow-list、`ruleActions`、プラグインとチェッカーの baseline |
| `modules/opencode/permissions.nix` | ケーパビリティオプションから共通・役割別の順序付き権限を生成する関数（R1′ の baseReadMirrors を含む） |
| `modules/opencode/guards.nix` | 全プロファイル共通の危険コマンド・機密ファイル読み取りガード定義 |
| `modules/opencode/plugins/action-drift-monitor.js` | 未知 action を fail-closed で拒否する監視プラグイン（配置時に baseline を埋め込み） |
| `modules/opencode/providers.nix` | プロバイダーごとのモデル設定・推論設定・variant |
| `modules/opencode/opencode.nix` | Nix 宣言の import、コマンド、MCP、監視対象などの設定 |
| `modules/opencode/AGENTS.md` | 可読性・保守性と作業範囲に関する共通ルール |
| `modules/opencode/prompts/spec.md` | 対話・計画・確認・委譲を担当する `spec` のプロンプト |
| `modules/opencode/prompts/plan_review.md` | 計画・設計・重要な実装変更を確認する `plan_review` のプロンプト |
| `modules/opencode/prompts/explore.md` | 深い調査専用に再定義した `explore` のシステムプロンプト |
| `modules/opencode/prompts/output-format.md` | 共通の STATUS、summary、findings、validation、impact と証拠の報告規則 |
| `opencode.json`（リポジトリ直下） | プロジェクト用オーバーレイ。`nix-verify` / `minimal-repository` の許可と `agents.spec` の追加許可 |

`spec` と `plan_review` の指示は英語で記述します。ユーザー向けの計画・質問・報告は `spec` が日本語で行います。組み込みサブエージェントへは委譲時に必要な証拠と報告内容を指定します。

共通出力形式は `output-format.md` の一箇所で管理し、`modules/opencode/default.nix` が配置先の `AGENTS.md` に結合します。v2 はグローバルな `AGENTS.md` をシステムプロンプトに追加するため、組み込みの `general` は標準プロンプトを保ち、`explore` は `system` を上書きしつつ、どちらも同じ出力形式を共有できます。独自エージェントの `system` へ出力形式を重複して埋め込みません。

推論設定は `providers.nix` の `<provider>.models.<model>.variants` に揃え、各 variant の `id` と `settings.reasoningEffort` を同じ値にします。モデル一覧の対応値に合わせて、GLM と DeepSeek V4.1 Flash は `low`、`high`、`max`、Qwen3.8 Flash は `low`、`medium`、`xhigh`、Luna は `none`、`low`、`medium`、`high`、`xhigh`、`max`、StepFun 無料枠（モデル ID `opencode/step-5-preview-free`）は `low`、`medium`、`high` を定義します。DeepSeek と Qwen のモデル ID はそれぞれ `opencode-go/deepseek-v4.1-flash` と `opencode-go/qwen3.8-flash` です。`spec` は `#medium`、`general` と `plan_review` は `#max`、`explore` は `#high` を明示して選択します。別の強度を選ぶ場合はエージェントのモデル指定を `#low` などに変更します。agent の旧 `reasoningEffort` や、実行時に送信されない `request.body` には置きません。

[OpenCode Go](https://opencode.ai/docs/go/#how-it-works) の `opencode-go/mimo-v2.6-flash` と `opencode-go/mimo-v2.6-pro` も `providers.nix` に登録します。現時点の Go のモデル一覧では両モデルの `reasoning_options` が空のため、`variants = [ ];` としてカタログの既定設定を使用します。選択時は `#max` などを付けずにモデル ID を指定します。

### 4.4 ファイル配置

`programs.opencode.settings` から `~/.config/opencode/opencode.json` を生成します。Nix のソースや Markdown エージェントを別途配置する必要はありません。

| リポジトリ内の source | 配置先 |
| --- | --- |
| `modules/opencode/AGENTS.md` + `modules/opencode/prompts/output-format.md` | `~/.config/opencode/AGENTS.md` |
| `modules/opencode/plugins/spec-question-guard.js` | `~/.config/opencode/plugins/spec-question-guard.js` |
| `modules/opencode/plugins/action-drift-monitor.js` | `~/.config/opencode/plugins/action-drift-monitor.js`（`@BASELINE_ACTIONS@` を `actions.nix` の既知 action リストで置換して配置） |
| `modules/opencode/plugins/nix-verify-gate.js` | `~/.config/opencode/plugins/nix-verify-gate.js` |
| `modules/opencode/cli.nix` | `~/.config/opencode/cli.json`（`builtins.toJSON` で生成） |

これらの配置は `modules/opencode/default.nix` に定義されています。`spec-question-guard.js` は `spec` の `question` 呼び出しを監視し、`plan_review` が一度でも完了結果を返した後は最新の完了結果を権威として扱います。最新の完了結果が `STATUS: COMPLETE` の間のみ、日本語の実装計画（見出し契約に適合するテキストのみ・ツールなしのメッセージ）の提示を検出するまで `question` を拒否します。最新の完了結果が `COMPLETE` 以外の場合やレビュー未完了の段階は許可し、ガード内部エラーと解析不能な完了履歴のみフェイルクローズドになります。他のエージェントやツールには干渉しません。

`action-drift-monitor.js` は `permission.evaluate` だけをフックし、`actions.nix` の baseline に無い action の権限評価を `deny` に変えて日本語メッセージを返します（fail-closed）。既知の action には何もしません。セッション途中で ad-hoc に許可へ切り替えることはできず、baseline の更新は「4.5 アクション空間のドリフト検出」の手順（承認ゲート付き）に従います。

端末 UI 設定の `~/.config/opencode/cli.json` は `modules/opencode/cli.nix` から Home Manager が生成・管理します。Home Manager が管理するようになった後は、アプリ内の TUI 設定変更（テーマピッカーや `/thinking` など）は永続化されない可能性があります。書き込みが失敗したり、管理されたリンクを通常ファイルへ置き換えたりする場合があり、その場合も次回の `home-manager switch` でリポジトリの内容に戻ります。設定を変更するときは `modules/opencode/cli.nix` を編集して switch してください。

`nix-verify-gate.js` は Nix 検証の順序ガードです。エージェント自身の完了宣言（現在のターンのアシスタントテキスト先頭行が `STATUS: COMPLETE` で始まること）を起点に、変更を含むチェックアウトのルートで `nix fmt` → `nix run home-manager -- build --flake .#koki` を完全一致のベアな単一コマンドとして成功させた証拠が揃うまで後続ステージを拒否し、欠けている前提と次に実行すべきコマンドを日本語で示します。`env` や `&`、`bash -c`、`&&` 連結などのラップ・複合形式は証拠にならず拒否されます。switch として受理されるのは `nix run home-manager -- switch --flake .#koki` と `home-manager switch --flake .#koki` の 2 形式のみで、いずれも検証対象 `.#koki` を固定します（`--flake` のない `home-manager switch` は対象未固定として拒否されます）。メインチェックアウト `/Users/koki/.dotfiles` のルート・branch `main` で同一セッション中に fmt と build の証拠が揃っている場合のみ許可候補となり、常に人間の承認（ask）に強制されます。人間の承認後も、実行直前にルートと branch を再確認し、成立しない場合は switch の起動を中止します（唯一のコマンド書き換えを伴う実行境界インターロック）。ガードは試行の監視のみで実行は強制せず、認識した変更操作（`rm`・`sed -i`・`git checkout`/`merge`/`restore`/`revert`/`switch`・`worktree` など）や `nix fmt` の再実行、編集系ツールの使用でセッションの検証証拠は保守的に破棄されます。

設定変更後は `nix fmt`、`nix run home-manager -- build --flake .#koki` を実行し、`result/home-files/.config/opencode/` の `opencode.json`、`AGENTS.md`、`cli.json`、`plugins/action-drift-monitor.js` を確認します。新規の参照ファイルは Git に追加してからビルドします。現環境への反映が必要な場合だけ `nix run home-manager -- switch --flake .#koki` を実行します。

### 4.5 アクション空間のドリフト検出

OpenCode や MCP サーバーが更新されると、既知の action 名（許可リスト）と実際の action 空間がずれます。ずれは次の多層で閉じ込めます。

| 変化 | 検出・防御 | 挙動 |
| --- | --- | --- |
| 新しい action がルール層に出現（組み込み・プラグイン・設定） | CHECK A（`opencode debug agents` の action 集合 vs `actions.nix`） | 追加 = exit 1。更新までは fail-closed で拒否 |
| 既知 MCP サーバーに新しいツールが追加 | 完全名 allow-list（`actions.nix`）+ action-drift-monitor プラグイン + CHECK B（`tools/list` の実測） | プラグインが初回呼び出しを deny。CHECK B の追加検出で exit 1 |
| 新しい組み込みツールで action がルールに現れない | CHECK A では列挙不能。プラグインが初回の権限評価で deny | 初回利用時に deny メッセージ → runbook で baseline 化 |
| permission.assert を持たないゲート（`execute` 露出など） | 検出不能な残差として扱う | 変更時は手動レビュー |
| MCP ツールの削除・改名 | CHECK B の削除/action 変更検出 | exit 1。上流削除かサーバー障害か区別できない場合は `opencode mcp list` とログで確認 |

チェッカーは `nix run .#opencodeActionCheck` で実行します（flake パッケージ `packages/opencode-action-check.nix`、aarch64-darwin 限定、python3 と固定版 OpenCode を同梱）。主なオプションは `--home ./result`（候補 generation の隔離検証）、`--capture`（候補 baseline を stdout に出力）、`--skip-introspection`、`--mcp-timeout <秒>` です。終了コードは 0 = drift なし、1 = drift（追加・削除・action 変更）、2 = 判定保留（MCP 起動失敗・スキップなど。heuristic で 0/1 に丸めません）。

#### 「AI での修正手順」

```sh
# 1. 現状把握（exit 1 = drift、exit 2 = 判定保留）
nix run .#opencodeActionCheck

# 2. 候補 baseline を取得（ファイルは書かない）
nix run .#opencodeActionCheck -- --capture

# 3. modules/opencode/actions.nix を更新（ruleActions / expectedRuleActions /
#    mcpToolActions / builtinPairs）。追加項目はアクセス付与なのでユーザー承認が必須
nix fmt
nix run home-manager -- build --flake .#koki

# 4. 候補 generation を検証（workdir は graphify-out があるリポジトリ実体を指定）
nix run .#opencodeActionCheck -- --home ./result --workdir /Users/koki/.dotfiles

# 5. switch はユーザーの明示依頼時のみ
nix run home-manager -- switch --flake .#koki
```

修正手順の要点:

- allow-list への追加はアクセス付与そのものです。ユーザー承認なしに baseline を広げないでください。
- 削除項目は上流削除かサーバー障害かを区別できない場合、`opencode mcp list` と `~/.local/share/opencode/log` を確認してください。
- decline や denial のメッセージには `nix run .#opencodeActionCheck` による確認と承認フローが示され、セッション途中の ad-hoc 承認はできません。

公式仕様: [エージェント](https://opencode.ai/v2/docs/agents/)、[権限](https://opencode.ai/v2/docs/permissions/)、[共通指示](https://opencode.ai/v2/docs/instructions/)、[モデル](https://opencode.ai/v2/docs/models/)、[v1 からの移行](https://opencode.ai/v2/docs/migrate-v1/)。

## 5. スキルの管理

グローバルに配備するスキルは `skills/` ディレクトリに集約して管理します。各スキルは次の形式です。

```text
skills/<skill-name>/SKILL.md
```

現在 `skills/` にあるグローバルスキルは次の 5 個です。

| スキルディレクトリ | 定義ファイル |
| --- | --- |
| `skills/computer-use/` | `skills/computer-use/SKILL.md` |
| `skills/gh-cli/` | `skills/gh-cli/SKILL.md` |
| `skills/orca-cli/` | `skills/orca-cli/SKILL.md` |
| `skills/orchestration/` | `skills/orchestration/SKILL.md` |
| `skills/playwright-cli/` | `skills/playwright-cli/SKILL.md` |

Home Manager は `mkOutOfStoreSymlink` を使って、リポジトリの `skills/` を `~/.agents/skills` から参照できるようにします。リンクが作成済みであれば、リポジトリ内の `SKILL.md` を編集した内容がグローバルスキルへ即時反映されます。リンク自体の作成や再配置を変更した場合は、Home Manager の switch を再実行してください。

リポジトリ固有のスキルは `.agents/skills/<skill-name>/SKILL.md` に配置します（現在は `nix-verify` と `minimal-repository` の 2 つ）。これらは `.gitignore` の例外設定でバージョン管理しますが、`~/.agents/skills` へのリンク対象外で、グローバルには配備されません。リポジトリ固有のスキルを追加する場合も同じ場所に配置します。

グローバルに配備する新しいスキルを追加するときも、まずモデルや既存のエージェント設定で代替できないかを確認します。追加する場合は `skills/<skill-name>/SKILL.md` に、目的と実行方針を必要最小限で記述します。

### `playwright-cli` の vendoring と更新

`playwright-cli` は、Playwright 公式エージェント CLI によるブラウザ自動化と E2E テストのためのスキルです。npm パッケージ `@playwright/cli@0.1.21`（`playwright` / `playwright-core 1.64.0-alpha-1789764292000` を固定）に同梱されるスキルを、改変せずそのまま `skills/playwright-cli/` に配置しています。ライセンスは Apache-2.0 で、正文を `skills/playwright-cli/LICENSE` に同梱します（上流に NOTICE はありません）。

利用前提として、CLI 本体を vendored スキルと同じバージョンで Nix 管理します。バージョンと 3 つの tarball URL・SRI ハッシュは `packages/playwright-cli.nix` に定義し、次のコマンドで導入します。

```sh
nix run home-manager -- switch --flake .#koki
playwright-cli install-browser
```

`install-browser` は初回のみ必要です。ブラウザは `~/Library/Caches/ms-playwright` にダウンロードされます。

更新は vendored スキルと CLI を必ずペアで行います。

1. リポジトリ外のスクラッチディレクトリで `npx -y @playwright/cli@<新バージョン> install --skills=agents` を実行します。
2. 生成された `.agents/skills/playwright-cli/` を `skills/playwright-cli/` へコピーし、`LICENSE`（上流に `NOTICE` があればそれも）を維持します。
3. `diff -r <スクラッチ>/.agents/skills/playwright-cli skills/playwright-cli` で差分がないことを確認します。
4. `packages/playwright-cli.nix` の `version` を新バージョンへ更新します。`playwright` と `playwright-core` の URL は、新バージョンの `@playwright/cli` のレジストリメタデータ（`dependencies`）に記載されたバージョンへ更新します。
5. 3 つの URL の SRI ハッシュを `nix hash file <tarball>` などで取得して更新し、`nix run home-manager -- switch --flake .#koki` を実行します。
6. ブラウザのリビジョンが変わった場合は `playwright-cli install-browser` を再実行します。

`@latest` の導入や実行時のみの更新は、vendored スキルと CLI のバージョンを乖離させます。CLI のスキル整合チェックは実行ディレクトリ配下（`./.agents/skills/` など）だけを対象とするため、`~/.agents/skills` 経由で参照されるこのグローバル配備はチェックの対象外です。インストーラーは `--global` 付き、またはこのリポジトリ内で実行しないでください。`--global` は `~/.agents/skills` のリンクを通じて、リポジトリ内での実行は `.agents/skills/` と `.gitignore` への書き込みを通じて、それぞれ未追跡ファイルや意図しない差分を作業ツリーへ混入させます。

## 6. スクリプト

| スクリプト | 役割 |
| --- | --- |
| `scripts/install.sh` | Nix の確認・導入、アカウント設定、SSH キーの準備、Home Manager の switch までを行うメインセットアップスクリプトです。 |
| `scripts/migrate-legacy-links.sh` | 旧レイアウトの Git ignore と VS Code のシンボリックリンクを、switch 前に安全に移行するスクリプトです。 |
| `scripts/check-opencode-actions.sh` | OpenCode の action 空間のドリフトチェッカー本体です。単体実行もできますが、通常は flake の `packages.opencode-action-check.nix` から `nix run .#opencodeActionCheck` で実行します（python3 と固定版 OpenCode を同梱）。 |

メインスクリプトは zsh で実行します。

```sh
zsh scripts/install.sh
```

`install.sh` は Home Manager の switch より前に、次の処理を行います。

```sh
zsh scripts/migrate-legacy-links.sh
nix run home-manager -- switch --flake .#koki
```

移行スクリプトは、対象が旧シンボリックリンクであることを確認してから削除します。安全でないリンク連鎖、別のリンク先、シンボリックリンクではないオブジェクトなどを検出した場合は、旧リンクを削除せずに中止します。移行に失敗した場合も、`install.sh` は switch を続行しません。

## 7. パッケージ管理

`packages/` には、Home Manager のセットアップフローから利用する Nix パッケージ定義を集約します。通常の CLI パッケージは `modules/cli.nix` の `home.packages` で定義し、`home.nix` の import を通じて Home Manager に読み込ませます。

| ファイル | 役割 |
| --- | --- |
| `packages/ssh-bootstrap.nix` | SSH キーの生成と管理を行う `ssh-bootstrap` パッケージを定義します。 |
| `packages/opencode.nix` | OpenCode CLI 本体の固定バージョンを定義し、`modules/opencode/default.nix` から読み込みます。 |
| `packages/opencode-action-check.nix` | action 空間のドリフトチェッカー `opencodeActionCheck` を定義します。`actions.nix` の baseline を焼き込み、aarch64-darwin 限定で公開します。 |
| `packages/playwright-cli.nix` | `@playwright/cli` の固定バージョンを定義し、`modules/cli.nix` から読み込みます。 |
| `modules/cli.nix` | Home Manager の `home.packages` に導入する CLI ツールを定義します。 |

`packages/ssh-bootstrap.nix` は `flake.nix` の package/app として公開され、セットアップ時に `install.sh` から利用されます。SSH キーそのものをリポジトリへ保存するのではなく、必要な環境でこの SSH キーのプロビジョニング処理を実行する設計です。

パッケージ定義を変更した場合は、内容を確認してから、リポジトリのルートで次の Home Manager コマンドを実行します。

```sh
nix run home-manager -- switch --flake .#koki
```
