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
| `modules/mise.nix` | mise の有効化と Zsh 連携を定義します。 |
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
| `hosts/` | `isDarwin` などの条件に応じて、ホスト固有のモジュールを選択します。 |

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

エージェントは `modules/opencode/agents.nix` の `agents` に OpenCode v2 の構造で宣言します。`opencode.nix` はこれを import し、コマンド・MCP などの設定と結合します。Home Manager が最終的な JSON を生成します。モデル設定と順序付きの `permissions` は Nix に集約し、独自エージェントの `system` は `prompts/` の Markdown を `builtins.readFile` で読み込みます。YAML フロントマターは使いません。読み取り制限とスキル許可は Nix の共通定義を再利用します。

組み込みの `general` と `explore` はモデルと権限だけを調整します。`system`、`description`、`mode` を再定義しないため、OpenCode の標準動作を引き継ぎます。作業固有の制約、調査の深さ、成果物、検証方法は `spec` が委譲時に渡します。拡張が必要なときも、まず既存の組み込みエージェントで対応できるかを確認します。

#### 権限の管理

v2 の `permissions` は `action`、`resource`、`effect` の配列で、最後に一致したルールが優先されます。組み込みの既定値、共通ルール、エージェントごとのルールの順に適用されます。シェル操作は `shell`、委譲は `subagent` です。

権限定義は `modules/opencode/permissions.nix` の関数に集約し、`agents.nix` では `mkPermissions "global"` や `mkPermissions "spec"` のように名前を指定します。各プロファイルは、OpenCode V2 の JSONC と同じ `{action, resource, effect}` リテラルの順序付き配列として直接記述します。最後に一致したルールが優先されるため、記述した順序がそのまま適用順序になります。

共通ルールで機密ファイルの読み取りを制限し、危険なコマンドの拒否、push や環境切り替え時の確認を維持します。シェルの拒否パターンは完全なサンドボックスではありません。調査・レビュー役ではシェルと編集を拒否します。

| エージェント | ファイル・シェル | MCP | 委譲 |
| --- | --- | --- | --- |
| `spec` | 読み取り・編集・シェルを拒否 | 拒否 | `explore`、`general`、`plan_review` のみ |
| `general` | 組み込みの実装権限と共通制限。外部ディレクトリは拒否 | Chrome DevTools | 拒否 |
| `explore` | 読み取り専用。コード・Web 調査、外部ディレクトリの読み取りを許可 | Graphify | 拒否 |
| `plan_review` | 読み取り専用。Web とシェルを拒否 | Graphify | 拒否 |

グローバルなスキルの許可対象は `gh-cli`、`computer-use`、`orca-cli`、`orchestration`、`playwright-cli` です。`explore` と `plan_review` ではスキルを拒否します。このリポジトリの `opencode.json` は `nix-verify` と `minimal-repository` を許可し、`spec` と `general` がリポジトリ固有の手順を利用できます。

### 4.2 エージェント構成

| エージェント | 区分 | モデル | 役割 |
| --- | --- | --- | --- |
| `spec` | 独自 primary（既定） | `opencode-go/qwen3.8-flash#medium` | 日本語での対話、計画、ユーザー確認、委譲 |
| `general` | 組み込み subagent | `opencode-go/deepseek-v4.1-flash#max` | 実装・検証・承認済みのアーキテクチャ文書更新 |
| `explore` | 組み込み subagent | `opencode/mimo-v2.6-flash-free` | 対象を絞った調査、広範なコード調査、外部の一次情報調査 |
| `plan_review` | 独自 subagent | `openai/gpt-6-luna#max` | 計画・設計相談・重要な実装変更のレビュー |

`spec → explore / plan_review → ユーザー確認 → general` を基本とし、重要な変更は実装後にも `plan_review` で確認します。組み込みの `build` と `plan` はそのまま利用できます。旧 `executer` は `general`、旧 `deep_explore` と `internet_search` は `explore` に統合しました。

サブエージェントからの再委譲は行いません。文書更新を計画に含めて承認された場合にのみ、`spec` が `general` へ直接依頼します。

### 4.3 設定ファイル

| ファイル | 役割 |
| --- | --- |
| `modules/opencode/agents.nix` | v2 のエージェント宣言、利用モデル、権限・プロンプト・プロバイダー設定の読み込み |
| `modules/opencode/permissions.nix` | 共通・役割別の順序付き権限を生成する関数 |
| `modules/opencode/providers.nix` | プロバイダーごとのモデル設定・推論設定・variant |
| `modules/opencode/opencode.nix` | Nix 宣言の import、コマンド、MCP、監視対象などの設定 |
| `modules/opencode/AGENTS.md` | 可読性・保守性と作業範囲に関する共通ルール |
| `modules/opencode/prompts/spec.md` | 対話・計画・確認・委譲を担当する `spec` のプロンプト |
| `modules/opencode/prompts/plan_review.md` | 計画・設計・重要な実装変更を確認する `plan_review` のプロンプト |
| `modules/opencode/prompts/output-format.md` | 共通の STATUS、summary、findings、validation、impact と証拠の報告規則 |
| `opencode.json` | このリポジトリで使うスキルの許可 |

`spec` と `plan_review` の指示は英語で記述します。ユーザー向けの計画・質問・報告は `spec` が日本語で行います。組み込みサブエージェントへは委譲時に必要な証拠と報告内容を指定します。

共通出力形式は `output-format.md` の一箇所で管理し、`modules/opencode/default.nix` が配置先の `AGENTS.md` に結合します。v2 はグローバルな `AGENTS.md` をシステムプロンプトに追加するため、組み込みの `general` と `explore` の標準プロンプトを保ちながら、同じ出力形式を共有できます。独自エージェントの `system` へ出力形式を重複して埋め込みません。

推論設定は `providers.nix` の `<provider>.models.<model>.variants` に揃え、各 variant の `id` と `settings.reasoningEffort` を同じ値にします。モデル一覧の対応値に合わせて、GLM と DeepSeek V4.1 Flash は `low`、`high`、`max`、Qwen3.8 Flash は `low`、`medium`、`xhigh`、Luna は `none`、`low`、`medium`、`high`、`xhigh`、`max` を定義します。DeepSeek と Qwen のモデル ID はそれぞれ `opencode-go/deepseek-v4.1-flash` と `opencode-go/qwen3.8-flash` です。`spec` は `#medium`、`general` と `plan_review` は `#max` を明示して選択します。別の強度を選ぶ場合はエージェントのモデル指定を `#low` などに変更します。agent の旧 `reasoningEffort` や、実行時に送信されない `request.body` には置きません。

[OpenCode Go](https://opencode.ai/docs/go/#how-it-works) の `opencode-go/mimo-v2.6-flash` と `opencode-go/mimo-v2.6-pro` も `providers.nix` に登録します。現時点の Go のモデル一覧では両モデルの `reasoning_options` が空のため、`variants = [ ];` としてカタログの既定設定を使用します。選択時は `#max` などを付けずにモデル ID を指定します。

### 4.4 ファイル配置

`programs.opencode.settings` から `~/.config/opencode/opencode.json` を生成します。Nix のソースや Markdown エージェントを別途配置する必要はありません。

| リポジトリ内の source | 配置先 |
| --- | --- |
| `modules/opencode/AGENTS.md` + `modules/opencode/prompts/output-format.md` | `~/.config/opencode/AGENTS.md` |
| `modules/opencode/plugins/spec-question-guard.js` | `~/.config/opencode/plugins/spec-question-guard.js` |

この 2 つの配置は `modules/opencode/default.nix` に定義されています。`spec-question-guard.js` は `spec` の `question` 呼び出しを監視し、`plan_review` が一度でも完了結果を返した後は最新の完了結果を権威として扱います。最新の完了結果が `STATUS: COMPLETE` の間のみ、日本語の実装計画（見出し契約に適合するテキストのみ・ツールなしのメッセージ）の提示を検出するまで `question` を拒否します。最新の完了結果が `COMPLETE` 以外の場合やレビュー未完了の段階は許可し、ガード内部エラーと解析不能な完了履歴のみフェイルクローズドになります。他のエージェントやツールには干渉しません。端末 UI 設定は OpenCode が管理する `~/.config/opencode/cli.json` に保存します。

設定変更後は `nix fmt`、`nix run home-manager -- build --flake .#koki` を実行し、`result/home-files/.config/opencode/` の `opencode.json` と `AGENTS.md` を確認します。新規の参照ファイルは Git に追加してからビルドします。現環境への反映が必要な場合だけ `nix run home-manager -- switch --flake .#koki` を実行します。

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

`playwright-cli` は、Playwright 公式エージェント CLI によるブラウザ自動化と E2E テストのためのスキルです。npm パッケージ `@playwright/cli@0.1.21`（`playwright-core 1.64.0-alpha-1789764292000` を固定）に同梱されるスキルを、改変せずそのまま `skills/playwright-cli/` に配置しています。ライセンスは Apache-2.0 で、正文を `skills/playwright-cli/LICENSE` に同梱します（上流に NOTICE はありません）。

利用前提として、実行する CLI を vendored スキルと同じバージョンに固定します。

```sh
mise use -g npm:@playwright/cli@0.1.21
playwright-cli install-browser
```

更新は vendored スキルと CLI を必ずペアで行います。

1. リポジトリ外のスクラッチディレクトリで `npx -y @playwright/cli@<新バージョン> install --skills=agents` を実行します。
2. 生成された `.agents/skills/playwright-cli/` を `skills/playwright-cli/` へコピーし、`LICENSE`（上流に `NOTICE` があればそれも）を維持します。
3. `diff -r <スクラッチ>/.agents/skills/playwright-cli skills/playwright-cli` で差分がないことを確認します。
4. このドキュメントの固定バージョンを更新し、`mise use -g npm:@playwright/cli@<新バージョン>` を実行します。

`@latest` の導入や実行時のみの更新は、vendored スキルと CLI のバージョンを乖離させます。CLI のスキル整合チェックは実行ディレクトリ配下（`./.agents/skills/` など）だけを対象とするため、`~/.agents/skills` 経由で参照されるこのグローバル配備はチェックの対象外です。インストーラーは `--global` 付き、またはこのリポジトリ内で実行しないでください。`--global` は `~/.agents/skills` のリンクを通じて、リポジトリ内での実行は `.agents/skills/` と `.gitignore` への書き込みを通じて、それぞれ未追跡ファイルや意図しない差分を作業ツリーへ混入させます。

## 6. スクリプト

| スクリプト | 役割 |
| --- | --- |
| `scripts/install.sh` | Nix の確認・導入、アカウント設定、SSH キーの準備、Home Manager の switch までを行うメインセットアップスクリプトです。 |
| `scripts/migrate-legacy-links.sh` | 旧レイアウトの Git ignore と VS Code のシンボリックリンクを、switch 前に安全に移行するスクリプトです。 |

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
| `packages/playwright-cli.nix` | `@playwright/cli` の固定バージョンを定義し、`modules/cli.nix` から読み込みます。 |
| `modules/cli.nix` | Home Manager の `home.packages` に導入する CLI ツールを定義します。 |

`packages/ssh-bootstrap.nix` は `flake.nix` の package/app として公開され、セットアップ時に `install.sh` から利用されます。SSH キーそのものをリポジトリへ保存するのではなく、必要な環境でこの SSH キーのプロビジョニング処理を実行する設計です。

パッケージ定義を変更した場合は、内容を確認してから、リポジトリのルートで次の Home Manager コマンドを実行します。

```sh
nix run home-manager -- switch --flake .#koki
```
