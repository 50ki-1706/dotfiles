# ユーザーガイド

このガイドでは、Nix と Home Manager で構成された本リポジトリの構造、設定の適用方法、OpenCode エージェントハーネスの考え方を説明します。パスは、特に断りがない限りリポジトリのルートからの相対パスです。

## 1. はじめに

このリポジトリは、Nix で管理される dotfiles リポジトリです。シェル、エディタ、ターミナル、Git、SSH、CLI ツールなどの設定を、Nix の宣言的な構成として管理します。

Home Manager を設定の中心に置き、`home/home.nix` を入口として各モジュールを読み込みます。設定を一元管理することで、同じ構成を再適用しやすくし、設定ファイルの配置とパッケージの導入を同じワークフローで扱えます。

また、本リポジトリには OpenCode エージェントハーネスが含まれています。エージェントの役割、プロンプト、権限、スキルを分離し、Nix の関数で重複を減らしながら、調査・計画・実装・検証を安全に分担できるように設計されています。

本リポジトリ全体を通じて、最小サイズを保つことを意識しています。不要なファイルや重複する設定を追加せず、既存の仕組みで代替できないかを常に検討します。これは OpenCode エージェントハーネスの設計思想だけでなく、Nix 設定、スクリプト、ドキュメント全体に適用される原則です。

## 2. ディレクトリ構造

| ディレクトリ | 目的 |
| --- | --- |
| `home/` | Home Manager モジュールと、Home Manager から配置する設定ファイルを管理します。 |
| `home/opencode/` | OpenCode のエージェント設定、プロンプト、プラグイン、サンプルを管理します。 |
| `home/dotfiles/` | Nix 式とは分離して管理する、生の設定ファイルを管理します。Git、npm、シェル、VS Code などの設定が含まれます。 |
| `hosts/` | ホストやプラットフォーム固有の設定を管理します。 |
| `packages/` | Nix パッケージ定義と SSH キー管理用の定義を管理します。 |
| `scripts/` | Nix の導入、初期セットアップ、旧シンボリックリンクの移行などのセットアップスクリプトを管理します。 |
| `skills/` | OpenCode およびエージェントが利用するスキル定義を集約します。 |
| `docs/` | リポジトリの構成や運用に関するドキュメントを管理します。 |

## 3. Home Manager の設定

### 3.1 入口とモジュールの読み込み

Home Manager の入口は `home/home.nix` です。主なモジュールを次のように読み込みます。

```nix
imports = [
  ./packages.nix
  ./ssh.nix
  ./fonts.nix
  ./helix.nix
  ./ghostty.nix
  ./git.nix
  ./shell.nix
  ./vscode.nix
  ../hosts
];
```

各モジュールの責務は次のとおりです。

| モジュール | 主な責務 |
| --- | --- |
| `home/packages.nix` | `home.packages` に導入する CLI ツールを定義します。 |
| `home/ssh.nix` | SSH の設定を定義します。 |
| `home/fonts.nix` | フォントと fontconfig の設定を定義します。 |
| `home/helix.nix` | Helix エディタの設定を定義します。 |
| `home/ghostty.nix` | Ghostty の設定を定義します。 |
| `home/git.nix` | Git の設定と Git 用の生設定ファイルの配置を定義します。 |
| `home/shell.nix` | Zsh とシェルエイリアスの設定を定義します。 |
| `home/vscode.nix` | VS Code の設定ファイルの配置を定義します。 |
| `hosts/` | `isDarwin` などの条件に応じて、ホスト固有のモジュールを選択します。 |

### 3.2 設定の適用

リポジトリのルートで、次のコマンドを実行します。

```sh
nix run home-manager -- switch --flake .#koki
```

このコマンドは、flake の `homeConfigurations."koki"` を対象に Home Manager の設定をビルドし、現在のユーザー環境へ適用します。Nix コードを変更した場合は、変更内容を確認したうえでこのコマンドを実行してください。

### 3.3 主な機能

- `programs.opencode` を有効にし、`pkgs.opencode` と `home/opencode/opencode.nix` の設定を Home Manager から適用します。
- `home.file.".agents/skills"` と `mkOutOfStoreSymlink` を使い、リポジトリの `skills/` を `~/.agents/skills` から参照できるようにします。
- `home.file` を使い、OpenCode 用のファイルを `~/.config/opencode/` 以下へ配置します。具体的な配置は [4.5 ファイル配置](#45-ファイル配置) に示します。

`mkOutOfStoreSymlink` は Nix store 内のコピーではなく、リポジトリを直接参照するリンクを作るための仕組みです。そのため、`skills/` 内の編集は、構築済みのリンクを通じてグローバルスキル側へ反映されます。

## 4. OpenCode エージェントハーネス（核心セクション）

OpenCode の設定は、単一の大きなプロンプトにすべてを詰め込むのではなく、エージェント、プロンプト、権限、スキル、配置ファイルに分割されています。これにより、必要な情報だけを必要なエージェントへ渡し、調査と実装の境界を保ちます。

### 4.1 設計思想

#### コンテキスト最小化の原則

エージェントへ一度に大量のリポジトリ情報を与えるのではなく、各ディレクトリに小さな `AGENTS.md` をポインターとして配置する方針です。

- エージェントは、作業対象のディレクトリにある `AGENTS.md` を、必要になった時だけ読み込みます。
- ディレクトリごとの目的、境界、運用ルールを局所化し、無関係な設定をコンテキストへ混ぜません。
- 各 `AGENTS.md` には EDR（Event-Driven Record）タイムラインを置き、変更履歴を短い記録として残します。
- ルートの `AGENTS.md` にはディレクトリ一覧の表を置き、対象ディレクトリの `AGENTS.md` へ誘導します。エージェントは、最初から全ファイルを読むのではなく、ポインターを辿って必要な情報だけを取得できます。

この方法は、プロンプトの長さを抑えるだけでなく、変更の影響範囲をディレクトリ単位で理解しやすくするための設計でもあります。

#### Nix 関数による重複排除

エージェント設定の共通処理は、Nix の `let/in` 構文でヘルパー関数へ切り出しています。設定の形式が変わった場合も、個々のエージェント定義を繰り返し修正せず、共通関数を修正できます。

- `mkAgent`: エージェント定義を共通化します。プロンプトを `prompts/` から読み込み、YAML フロントマターと結合します。
- `mkPermission`: 権限設定のプリセットを利用するための関数です。`denyAll`、`allowAll`、`bashAllow`、`readAllow`、`skillAllow` を組み合わせます。
- `readPrompt`: 次の式でエージェント名に対応する Markdown プロンプトを読み込みます。

  ```nix
  readPrompt = name: builtins.readFile (./prompts + "/${name}.md");
  ```

- `toYamlValue`、`toYamlMap` などの純粋関数で、Nix の属性を YAML へ変換する処理を共通化します。
- `agents.nix` では、6 つのエージェントを `mkAgent` で定義し、`permissions.nix` と `yaml.nix` を import します。

`agents.nix` の中心部分は次の形です。

```nix
let
  mkPermission = import ./permissions.nix;
  toYamlFrontmatter = import ./yaml.nix;

  commonOutputFormat = builtins.readFile ./prompts/output-format.md;
  readPrompt = name: builtins.readFile (./prompts + "/${name}.md");
  mkAgent =
    name: config:
    config
    // {
      prompt = toYamlFrontmatter config + "\n" + readPrompt name + "\n" + commonOutputFormat;
    };
in
```

これにより、エージェントのメタデータ、プロンプト本体、共通出力形式をそれぞれ別に保ちながら、OpenCode が読む一つの prompt へ生成できます。

#### エージェントの役割意識

各エージェントは、自分がプライマリーエージェントなのか、サブエージェントなのかを明示的に認識します。役割を `<Role>` セクションへ書くことで、エージェントがユーザーとの対話を担うのか、委譲された作業だけを実行するのかを区別できます。

- `spec.md` は `Primary orchestration and user-interface agent` と定義され、ユーザーインターフェースとオーケストレーションを担当します。
- `execute.md` は `Implementation subagent. Performs the task delegated by \`spec\`` と定義され、`spec` から委譲された実装を担当します。
- その他のエージェントも、調査、外部調査、計画レビューなど、自分の責務を `<Role>` で明記します。

この役割分担により、サブエージェントがユーザー確認や範囲外の変更を勝手に担当することを防ぎます。

#### パーミッションの個別管理（最小権限の原則）

エージェントごとに、必要な権限だけを付与します。調査エージェントには書き込みやシェル実行を与えず、実装エージェントには実装と検証に必要な権限を与える、という分離です。

| Agent | Read/Edit | Bash | Tools |
| --- | --- | --- | --- |
| `explore` | read-only (+ external_directory) | deny | graphify |
| `deep_explore` | read-only | deny | graphify |
| `executer` | edit: all | default | chrome-devtools, playwright |
| `internet_search` | all deny | deny | websearch, webfetch |
| `plan_review` | all deny | deny | none |

`permissions.nix` では、権限を Nix の属性として定義し、`permissionValue` ヘルパーでプリセット名と個別の属性設定を扱います。権限の形を一箇所に揃えることで、エージェントごとの設定を型安全に管理できます。調査・計画レビュー・外部調査のエージェントには拒否を基本とした設定を適用し、`executer` には実装に必要な編集・読み取り・スキル利用の設定を適用します。権限の詳細を変更する場合は、エージェント定義と `permissions.nix` の両方を確認してください。

#### スキルの必要性吟味

モデルの性能が高いほど、スキルを追加する前に「そのスキルは本当に必要か」を問い直します。OpenCode Principal Policy の方針は次の一文に集約されています。

> Implement by subtraction: reduce before adding

スキルは、モデルが毎回推測するよりも明確な手順や安全上の境界が必要な場合に限り、必要最小限に保ちます。重複する説明や、既存のエージェント・Nix 設定で代替できる内容を増やさないことが重要です。

現在のスキルは次のとおりです。

`architecture-update`、`computer-use`、`find-skills`、`gh-cli`、`nix-verify`、`orca-cli`、`orchestration`、`owasp-llm-top10`、`owasp-top10`

### 4.2 エージェント構成

エージェントは、ユーザーとの対話を行うプライマリーと、特定の作業を担うサブエージェントに分かれています。`spec` が必要な役割へ作業を委譲し、各サブエージェントは自分の責務に集中します。

| エージェント | 区分 | 役割 |
| --- | --- | --- |
| `spec` | primary | ユーザーインターフェース、計画策定、ユーザー確認、サブエージェントへの委譲を担当します。 |
| `explore` | subagent | 特定のファイルや機能を読み取り専用で調査します。 |
| `deep_explore` | subagent | ディレクトリ全体を広範に探索し、構造や依存関係をまとめます。 |
| `executer` | subagent | 委譲された実装を行い、検証結果と変更内容を報告します。 |
| `internet_search` | subagent | ローカルのコンテキストだけでは不十分な場合に、外部情報を調査します。 |
| `plan_review` | subagent | ユーザー確認前に実装計画をレビューします。 |

`spec` のデフォルトエージェント設定から、これら 5 つのサブエージェントを必要に応じて呼び出します。計画レビューを先に行い、ユーザー確認後に `executer` へ実装を委譲する流れが基本です。

### 4.3 プロンプト構成

各エージェントの Markdown プロンプトは `home/opencode/prompts/` にあります。

| ファイル | 内容 |
| --- | --- |
| `home/opencode/prompts/spec.md` | primary エージェントのオーケストレーション、確認、委譲のルールを定義します。 |
| `home/opencode/prompts/execute.md` | `executer` が実装と検証を行うためのルールを定義します。 |
| `home/opencode/prompts/explore.md` | 対象を絞った読み取り専用調査のルールを定義します。 |
| `home/opencode/prompts/deep_explore.md` | 広範なディレクトリ探索のルールを定義します。 |
| `home/opencode/prompts/internet_search.md` | 外部調査と情報源の扱いを定義します。 |
| `home/opencode/prompts/plan_review.md` | 実装計画のレビュー基準を定義します。 |
| `home/opencode/prompts/output-format.md` | 全エージェントに共通する出力形式を定義します。 |

ファイル名 `execute.md` とエージェント名 `executer` は意図的に異なります。`agents.nix` の `executer = mkAgent "execute" { ... };` が、`executer` に `execute.md` を対応付けます。

構成を組み立てるファイルの責務は次のとおりです。

| ファイル | 役割 |
| --- | --- |
| `home/opencode/agents.nix` | `mkAgent` で 6 エージェントを定義し、プロンプトと共通出力形式を結合します。 |
| `home/opencode/permissions.nix` | 権限プリセットと `permissionValue` ヘルパーを定義します。 |
| `home/opencode/yaml.nix` | Nix の設定から YAML フロントマターを生成する純粋関数を定義します。 |
| `home/opencode/AGENTS.md` | Principal Policy と Common Agent Rules だけを持つ、最小限の共通ルールです。 |
| `home/opencode/opencode.nix` | OpenCode 本体の設定と `agents.nix` の読み込みを定義します。 |

`agents.nix` は各エージェントの設定から `prompt` を除いた値を YAML フロントマターへ変換し、対応するプロンプトと `output-format.md` を連結します。`yaml.nix` は文字列、真偽値、整数、属性集合を扱い、拒否だけで構成される権限カテゴリや無効なツール設定を生成結果から省略します。

`home/opencode/AGENTS.md` の共通ルールは、可読性と保守性を優先する Principal Policy と、委譲されたタスクの範囲と付与されたツールだけを扱う Common Agent Rules で構成されています。個別の役割や言語などの内容は、各プロンプト側で定義します。

### 4.4 EDR タイムライン

EDR は Event-Driven Record の略です。各 `AGENTS.md` に、ディレクトリやエージェント設定に関する変更履歴を簡潔に記録します。形式は次のとおりです。

```text
YYYYMMDD HH:MM:SS +0900 - 説明
```

記録の例です。

```text
20260825 09:23:06 +0900 - Nix dotfilesの構成を整理し、home-managerのモジュールと配置用生設定をhome/配下へ集約しました。旧シンボリックリンクの移行処理をinstall.shのswitch前に追加しました。
20260826 11:43:45 +0900 - Ponytailのエッセンス（必要性ラダー）をAGENTS.mdに統合し、全エージェントプロンプトからRole/Objectiveの冗長を解消しました。
```

EDR は Git のコミット履歴の代替ではありません。目的は、エージェントが Git history を最初から読み込まなくても、なぜ構成が変わったのかをディレクトリ単位で理解できるようにすることです。新しい変更を加えた場合は、対象ディレクトリの `AGENTS.md` に同じ形式で短い記録を追加します。

### 4.5 ファイル配置

`home/home.nix` の `home.file` 定義で、リポジトリ内の OpenCode 用ファイルをユーザー環境へ配置します。

| リポジトリ内の source | 配置先 |
| --- | --- |
| `home/opencode/AGENTS.md` | `~/.config/opencode/AGENTS.md` |
| `home/opencode/example/architecture.md` | `~/.config/opencode/example/architecture.md` |
| `home/opencode/plugins/architecture-diff-context.js` | `~/.config/opencode/plugins/architecture-diff-context.js` |

この 3 つの配置は `home/home.nix` に定義されています。OpenCode の生成設定自体は `programs.opencode.settings` として構成され、エージェント定義は `home/opencode/agents.nix` から読み込まれます。

## 5. スキルの管理

スキルは `skills/` ディレクトリに集約して管理します。各スキルは次の形式です。

```text
skills/<skill-name>/SKILL.md
```

現在リポジトリにあるスキルは次の 9 個です。

| スキルディレクトリ | 定義ファイル |
| --- | --- |
| `skills/architecture-update/` | `skills/architecture-update/SKILL.md` |
| `skills/computer-use/` | `skills/computer-use/SKILL.md` |
| `skills/find-skills/` | `skills/find-skills/SKILL.md` |
| `skills/gh-cli/` | `skills/gh-cli/SKILL.md` |
| `skills/nix-verify/` | `skills/nix-verify/SKILL.md` |
| `skills/orca-cli/` | `skills/orca-cli/SKILL.md` |
| `skills/orchestration/` | `skills/orchestration/SKILL.md` |
| `skills/owasp-llm-top10/` | `skills/owasp-llm-top10/SKILL.md` |
| `skills/owasp-top10/` | `skills/owasp-top10/SKILL.md` |

Home Manager は `mkOutOfStoreSymlink` を使って、リポジトリの `skills/` を `~/.agents/skills` から参照できるようにします。リンクが作成済みであれば、リポジトリ内の `SKILL.md` を編集した内容がグローバルスキルへ即時反映されます。リンク自体の作成や再配置を変更した場合は、Home Manager の switch を再実行してください。

新しいスキルを追加するときも、まずモデルや既存のエージェント設定で代替できないかを確認します。追加する場合は `skills/<skill-name>/SKILL.md` に、目的と実行方針を必要最小限で記述します。

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

`packages/` には、Home Manager のセットアップフローから利用する Nix パッケージ定義を集約します。通常の CLI パッケージは `home/packages.nix` の `home.packages` で定義し、`home/home.nix` の import を通じて Home Manager に読み込ませます。

| ファイル | 役割 |
| --- | --- |
| `packages/ssh-bootstrap.nix` | SSH キーの生成と管理を行う `ssh-bootstrap` パッケージを定義します。 |
| `home/packages.nix` | Home Manager の `home.packages` に導入する CLI ツールを定義します。 |

`packages/ssh-bootstrap.nix` は `flake.nix` の package/app として公開され、セットアップ時に `install.sh` から利用されます。SSH キーそのものをリポジトリへ保存するのではなく、必要な環境でこの SSH キーのプロビジョニング処理を実行する設計です。

パッケージ定義を変更した場合は、内容を確認してから、リポジトリのルートで次の Home Manager コマンドを実行します。

```sh
nix run home-manager -- switch --flake .#koki
```
