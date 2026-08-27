# homeディレクトリについて

## 構成

- `home.nix`: home-manager設定の入口です。共通設定、Zellij/OpenCodeの配置、フォント導入アクティベーション、パッケージ導入アクティベーションを管理します。
- `git.nix`: `programs.git`と、`home/dotfiles/git/ignore`を`mkOutOfStoreSymlink`で配置する設定を管理します。
- `shell.nix`: `programs.zsh`と、`home/dotfiles/shell/aliases`をstore-backedで配置する設定を管理します。
- `vscode.nix`: Darwin限定でVSCode設定を`mkOutOfStoreSymlink`により配置します。
- `packages.nix`、`ssh.nix`、`fonts.nix`、`helix.nix`、`ghostty.nix`: 各ツール、SSH、フォント、エディタ、ターミナルのモジュールです。
- `zellij/`: Zellij設定です。
- `dotfiles/`: 配置対象のgit/ignore、vscode/、shell/aliasesと、未リンクのcodex/スナップショットを管理します。
- `opencode/`: OpenCode設定、プロンプト、プラグイン、サンプルを管理します。
- `docs/`: home-manager関連ドキュメントを管理します。

## home-managerで管理されているツール、ライブラリについて

### `home.packages`で明示的に導入しているもの

| 定義 | 用途 |
| --- | --- |
| `pkgs.fzf` | コマンドラインでの曖昧検索ツール |
| `pkgs.git` | Gitのコマンドラインツール |
| `pkgs.lazygit` | GitリポジトリをターミナルUIで操作するツール |
| `pkgs.bitwarden-cli` | Bitwardenのコマンドラインツール |
| `pkgs.devbox` | プロジェクトごとの開発環境を扱うツール |
| `pkgs.claude-code` | Claude CodeのCLIツール |
| `pkgs.nixfmt` | Nixコードのフォーマッタ |
| `pkgs.ripgrep` | 高速なテキスト検索ツール |
| `pkgs.yazi` | ターミナル上のファイルマネージャ |
| `pkgs.yq-go` | Go実装のyqコマンドラインツール |
| `pkgs.zellij` | ターミナルマルチプレクサ |
| `ollamaPkgs.ollama` | ローカルLLM実行ツール |

### `fonts.nix`で明示的に導入しているもの

| 定義 | 用途 |
| --- | --- |
| `pkgs.nerd-fonts.jetbrains-mono` | JetBrains Mono Nerd Font |
| `pkgs.nerd-fonts.fira-code` | Fira Code Nerd Font |

### `programs.*`で有効化、設定しているもの

| 定義 | 用途 |
| --- | --- |
| `programs.zsh` | Zshを有効化し、`~/.config/shell/aliases`と`~/.zshrc.local`を読み込みます。 |
| `programs.mise` | miseを有効化し、Zsh連携も有効化します。 |
| `programs.starship` | Starshipプロンプトを有効化し、Zsh連携も有効化します。 |
| `programs.git` | Gitを有効化し、SSH署名形式、グローバルignore、アカウント別includeを設定します。 |
| `programs.gh` | GitHub CLIを有効化し、GitプロトコルをSSHに設定します。 |
| `programs.ssh` | SSH設定を有効化し、GitHub用の鍵とmacOS Keychain連携を`settings`で設定します。 |
| `programs.opencode` | OpenCode CLIを有効化し、`home/opencode/opencode.nix`の設定を適用します。 |
| `programs.helix` | Helixエディタを有効化し、テーマ、キー設定、Nixの自動フォーマットを設定します。 |
| `programs.ghostty` | Ghosttyを有効化し、起動時に`zellij attach -c ghostty`を実行するよう設定します。 |

### その他の管理対象

| 定義 | 用途 |
| --- | --- |
| `fonts.fontconfig.enable` | fontconfigベースのアプリでHome Manager管理フォントを利用できるようにします。 |
| `home.activation.installFonts` | macOSネイティブアプリ向けにNerd Fontを`~/Library/Fonts/HomeManager`へコピーします。 |
| `home.file.".config/shell/aliases"` | `home/dotfiles/shell/aliases`を`~/.config/shell/aliases`としてstore-backedに配置します。 |
| `home.file.".npmrc"` | `home/dotfiles/npm/npmrc`を`~/.npmrc`として配置します。 |
| `home.file.".config/zellij/layouts/ide.kdl"` | `ide`関数で開くZellijレイアウトを配置します。 |
| `home.file.".config/zellij/layouts/split.kdl"` | 1:1縦分割のZellijレイアウトを配置します。 |
| `home.file.".config/zellij/config.kdl"` | Zellijのキーバインド設定を配置します。macOSのOption+RightArrow衝突を避けるため`Alt f`を削除しています。 |
| `home.file.".config/opencode/AGENTS.md"` | `home/opencode/AGENTS.md`をOpenCode用の`~/.config/opencode/AGENTS.md`として配置します。 |
| `home.file.".config/helix/yazi-picker.sh"` | HelixからYaziを開き、選択ファイルをHelixで開く補助スクリプトを配置します。 |
| `home.activation.installPackages` | Home Managerのパッケージ導入処理を、現在のNix CLIに合わせて`nix profile add`へ調整します。 |

### 設定内で補助的に参照しているパッケージ

| 定義 | 用途 |
| --- | --- |
| `pkgs.bash` | `yazi-picker.sh`の実行シェル |
| `pkgs.gnused` | Yaziの`search://`形式のパス整形 |
| `pkgs.ghostty-bin` | Ghosttyの実行パッケージ |

## VSCodeについて

- VSCode本体と拡張機能はHomebrew/Brewfileで管理します。ルートの `Brewfile` に `vscode "..."` として拡張機能を記載しています。
- VSCodeの `settings.json` / `keybindings.json` は `home/dotfiles/vscode/` で管理し、`home/vscode.nix` の `home.file` から配置します。Darwinの配置先は `~/Library/Application Support/Code/User/` です。
- Linuxで同様の構成を使う場合は、`home/vscode.nix` の配置先を `~/.config/Code/User/` に変更してください。ディストリビューションやVSCode変種によってパスが異なる可能性があるため、事前に確認してください。

## Gitとシェルエイリアスについて

- Gitのignoreは `home/dotfiles/git/ignore` を `home/git.nix` の `mkOutOfStoreSymlink` で `~/.config/git/ignore` に配置します。`programs.git.settings.core.excludesFile` がこのパスを参照し、`programs.git.includes` は `~/.config/git/accounts.include` を参照します。
- シェルエイリアスは `home/dotfiles/shell/aliases` を `home/shell.nix` の通常の `home.file` sourceで `~/.config/shell/aliases` に配置します。Zshはこのファイルをsourceし、既存のrcファイルを直接上書きしません。

## docsディレクトリについて
- OpenCode: `docs/opencode/README.md`

## ロールバック
- Homebrew版に戻す場合は `brew install --cask visual-studio-code` を実行します。

## EDR timeline
以下のフォーマットで、homeディレクト内の変更を記録してください。変更の内容がわかるように、簡潔な説明をつけてください。
例:
```sh
20260529 12:00:00 +0900 - README.mdの簡略化のため、install.shの内容を整備しました。
```

20260529 23:24:59 +0900 - home-managerで管理しているツール、ライブラリ、生成ファイルの一覧を実装に合わせて整理しました。
20260529 23:32:07 +0900 - home-managerで管理するCLIツールにlazygitを追加しました。
20260529 23:44:38 +0900 - ide用のZellijレイアウトをhome-managerで配置する設定を追加しました。
20260529 23:49:00 +0900 - OpenCodeのprimary agentをspecに一本化し、grill-me-docs相当の事前確認subagentを追加しました。
20260529 23:50:11 +0900 - OpenCodeの未使用subagentを削除し、docsにagent構成と関係性を追記しました。
20260529 23:57:08 +0900 - ide用のZellijレイアウトでtab-barとstatus-barを表示するようにしました。
20260530 00:06:41 +0900 - ide用のZellijレイアウトをdefault_tab_template形式に変更しました。
20260530 00:11:26 +0900 - ide用のZellijレイアウトで左カラムの上下比率を3対1にしました。
20260530 00:25:32 +0900 - HelixのYazi起動キーバインドをNix storeの絶対パス参照にしました。
20260601 09:15:00 +0900 - gccをHomebrew管理からNix管理に移行しました（home/packages.nixにpkgs.gccを追加）。
20260601 22:49:10 +0900 - VSCodeをhome-managerで管理するためのモジュールを追加しました。
20260601 22:49:09 +0900 - vscodeをHomebrew管理からNix管理に移行（programs.vscode, home/vscode/新設）。拡張機能29個をversion+sha256固定で管理。config/vscode/は参照用として凍結。
20260602 11:36:06 +0900 - VSCode拡張機能の定義をvscode-extensions参照とMarketplace拡張の分割構成に整理しました。
20260602 12:00:00 +0900 - VSCode拡張機能管理を改善: 29個中24個をpkgs.vscode-extensionsの直接参照に切り替え、未収録の5個のみvscode-utilsで管理するように変更しました。
20260602 11:39:58 +0900 - yzane.markdown-pdf を vscode-utils 側へ移し、macOSで失敗する vscode-extensions 参照を避けるようにしました。
20260602 12:00:17 +0900 - VSCodeのNix管理用設定を追加し、home/vscode/settings.nix にユーザー設定を集約しました。
20260602 11:59:50 +0900 - home/vscode.nixをhome/vscode/ディレクトリに分割し、extensions.nix、keybindings.nix、settings.nixに整理しました。
20260602 12:03:17 +0900 - VSCode拡張機能の分割定義を見直し、GitHub Copilotを追加して24+6構成に揃えました。
20260602 13:31:40 +0900 - OpenCodeのpermission.bash設定を整理し、危険コマンド(chmod 777/chown -R/dd/shutdown/reboot/halt等)のdenyを追加。execute agentのpermission構文エラー(m ... m)も修正。
20260602 14:57:23 +0900 - VSCode profilesのMarketplace拡張6件のsha256を実値へ更新し、既存の~/.vscode/extensionsをactivationで退避してhome-manager switchを通るようにしました。
20260602 15:34:41 +0900 - gccをNix管理からdevbox管理へ移行しました（home/packages.nixからpkgs.gccを削除）。
20260602 15:35:00 +0900 - VSCodeのcmd+m d / cmd+m f（フォルダ/ファイル新規作成）のキーバインドのコマンドIDを標準のexplorer.newFolder / explorer.newFileに修正し、when句もexplorerViewletVisible && filesExplorerFocusに変更しました。
20260602 15:00:00 +0900 - Java VSCodeプロファイル: Extension Pack (vscjava.vscode-java-pack) を削除し、6つの個別拡張機能 (redhat.java, vscjava.vscode-java-debug, vscjava.vscode-java-test, vscjava.vscode-maven, vscjava.vscode-gradle, vscjava.vscode-java-dependency) に置き換えました。
20260603 20:58:47 +0900 - Zellij ideレイアウトの左上ペインからHelix自動起動を削除し、devbox shell有効化後に手動起動する方式に変更しました。
20260605 00:00:00 +0900 - claude-codeをNix管理のhome.packagesに追加
20260606 23:11:11 +0900 - OpenCodeのREADMEを正としてagent構成とpromptを再構築し、未使用agent設定を削除しました。
20260607 00:53:14 +0900 - OpenCode agentの言語ルールを共通AGENTSから各agent promptへ移動しました。
20260607 01:07:50 +0900 - OpenCodeのdeep_explore向けにgit履歴差分を生成するpluginと差分更新ルールを追加しました。

20260609 12:01:33 +0900 - architecture-diff-contextプラグインにメタデータ解析機能を追加。architecture.md先頭の-----区切りメタデータブロックからcommit-hashを読み取り、差分計算の基準コミットとして使用可能にしました。
20260610 00:00:00 +0900 - VSCodeの次回switch時にstate.vscdbを1回だけ削除するactivationを追加しました。
20260610 09:54:46 +0900 - VSCodeのSCM削除とcloseFolderのキーバインドを整理し、不要な4件を削除しました。
20260610 09:58:23 +0900 - vscode.nixのactivation参照をlib.hm.dag.entryBeforeへ修正し、hm未定義エラーを解消しました。
20260610 10:17:56 +0900 - VSCode activationでmarker作成前にUserディレクトリをmkdir -pするようにして、初回switch時のtouch失敗を防ぎました。
20260610 10:30:00 +0900 - VSCodeにpreviousEditorの左タブ移動キーバインドを追加しました。
20260610 12:00:00 +0900 - Ghosttyの設定にJetBrainsMono Nerd Font Monoを指定しました。
20260611 14:23:04 +0900 - 1:1縦分割のZellijレイアウト split.kdl を追加しました。
20260618 10:10:40 +0900 - OpenCodeのagent model割り当てを更新しました（plan_review→opencode-go/qwen3.7-max、deep_explore→opencode-go/glm-5.2、executer→opencode-go/kimi-k2.7-code、internet_search→openai/gpt-5.4-mini-fast）。
20260623 11:29:00 +0900 - VSCodeをNix管理からHomebrew/Brewfileとリポジトリ管理の設定ファイルへ移行しました。
20260623 12:00:00 +0900 - VSCode設定の配置先をmacOSの`~/Library/Application Support/Code/User/`に限定しました。Linux利用時は`~/.config/Code/User/`への変更が必要です。
20260623 12:30:00 +0900 - AeroSpaceをhome-manager経由で有効化し、launchdによる自動起動を設定しました（home/aerospace.nix新設）。
20260624 12:00:00 +0900 - AeroSpaceの設定をhome/aerospace.nixからhosts/darwin.nixへ移行し、macOS以外では読み込まれないようにしました。
20260624 12:30:00 +0900 - hosts/default.nix でのmacOS判定を、インポートフェーズで `isDarwin` 特殊引数を使って行う方式に整理しました。
20260630 19:15:32 +0900 - home-managerで管理するCLIツールにyq-go（Go実装のyq）を追加しました。
20260701 12:00:00 +0900 - OpenCodeのMCP設定にplaywrightを追加しました。
20260706 21:59:53 +0900 - Zellijのキーバインド設定`home/zellij/config.kdl`をhome-manager管理に移行し、macOS Option+RightArrow衝突を避けるため`Alt f`のバインドを削除しました。
20260707 10:14:38 +0900 - OpenCodeのarchitectureテンプレートとdiff guidanceを修正。deep_exploreが`.agents/archtecture.md`を初期化・更新し、placeholderを実情報で置き換えてメタデータを更新するようpromptとpluginを強化しました。
20260707 16:15:58 +0900 - OpenCodeのdeep_explore編集権限に、ドットファイルルート以外のプロジェクト向けパターン`*/.agents/archtecture.md`を追加しました。
20260710 23:32:42 +0900 - OpenCodeのskillディレクトリをhome-managerで管理するよう設定を追加しました。`home/opencode/skills`を`~/.config/opencode/skills`へ配置します。
20260711 11:32:42 +0900 - OpenCodeのarchitectureファイル名を正しい綴り`architecture.md`へ統一しました。テンプレート、plugin、prompt、agent設定、docsをcanonical名に更新し、個人のlegacyファイル`.agents/archtecture.md`への後方互換性を保持します。
20260726 08:25:48 +0900 - OpenCodeのagent定義を`home/opencode/agents.nix`へ分離し、`opencode.nix`は`agent = import ./agents.nix;`で読み込む構成に整理しました。生成される設定は変更前と同一です。
20260727 16:36:13 +0900 - OpenCodeのdeep_explore編集権限に、クロスプロジェクト向けのcanonical・legacy両方の`.agents/architecture.md`パターンを復元・追加しました。
20260731 07:02:24 +0900 - OpenCodeのarchitecture-diff-contextプラグインで、Nix store由来の0444な`.agents/architecture.md`を更新時に0644へ正規化し、既存ファイルのdeep_explore書き込み失敗を防ぐよう修正しました。
20260806 23:16:24 +0900 - OpenCodeのagent model割り当てを更新しました（spec→opencode-go/qwen3.7-plus、plan_reviewのreasoningEffortをxhighに設定）。
20260808 12:00:00 +0900 - Graphify（コード知識グラフツール）をNix管理のhome.packages（uv経由）に追加し、OpenCodeのMCPサーバーとして設定しました。
20260808 21:15:33 +0900 - home/opencode/skills/gh-cli/SKILL.md を追加。ghコマンドの操作（PR作成・編集、Issue管理、リモート情報取得）のためのOpenCodeグローバルスキルを作成。opencode.nix/opencode.json に権限追加、AGENTS.md にGitHub操作はghコマンドを使用する旨を追記。
20260824 19:10:00 +0900 - OpenCodeスキルを`skills/`へ集約し、home/opencodeと`.agents/skills`から移動したスキル、および既存のグローバルスキルを統合しました。`~/.agents/skills`はmkOutOfStoreSymlinkでリポジトリの`skills/`を参照します。
20260824 20:13:19 +0900 - Brewfileを現在の環境に合わせて再生成しました（brew formula/cask/vscode拡張の追加と削除）。
20260825 09:23:06 +0900 - home-managerの入口をhome.nixへ改名し、git.nix、shell.nix、vscode.nixとdotfiles/へ設定を分割しました。旧Git/VSCodeシンボリックリンクの移行処理をswitch前に追加しました。
20260825 10:48:18 +0900 - OpenCodeのpromptを圧縮し、共通ルール（言語・スコープ・ステータス語彙）をhome/opencode/AGENTS.mdのCommon Agent Rulesへ集約しました。モデル割当と仕様は変更なし。
20260826 10:34:53 +0900 - OpenCode subagentの権限と推論強度を調整し、executerの読み取り専用Git履歴を許可するとともに、deep_exploreの過剰権限と旧スペルのパス規則を削除しました。
20260826 10:37:29 +0900 - 実装精度を優先する運用方針に合わせ、OpenCode executerのreasoningEffortをmaxへ復元しました。
20260826 10:41:39 +0900 - OpenCodeの共通ルール・権限定義と重複するagent promptを圧縮し、specのtodowrite capabilityを無効化しました。
20260826 10:49:20 +0900 - OpenCode全agentの共通出力契約をグローバルAGENTS.mdへ集約し、個別promptをrole固有の内容定義へ整理しました。
20260826 11:02:06 +0900 - OpenCodeの共通出力形式をNixの単一定義から各agent promptへ付加し、global AGENTS.mdの反復注入コストを削減しました。
20260826 11:18:48 +0900 - OpenCodeの共通出力形式を専用Markdownへ分離し、agents.nixをpromptの読み込みと結合だけに整理しました。
20260826 15:05:44 +0900 - OpenCodeのarchitecture.md管理をdeep_exploreからexecuterに移管し、更新フローをskillとしてskills/architecture-update/に作成しました。spec.mdにエージェント権限テーブルを追加しました。
20260826 15:30:00 +0900 - OpenCodeの共通言語ルールを削除し、specの日本語指示はspec.md側へ集約しました。
20260826 22:37:46 +0900 - OpenCodeのagent権限生成とYAML frontmatter生成をagents.nixに集約し、agentごとの権限設定へ移行してglobal permissionを削除しました。
20260826 22:46:17 +0900 - OpenCodeのagent権限生成とYAML生成ヘルパーをpermissions.nixとyaml.nixへ分割しました。
20260826 22:48:36 +0900 - Bitwarden CLIを導入し、Bitwarden経由のNPMトークン取得とnpm認証設定をhome-managerで管理するよう追加しました。
20260826 22:57:23 +0900 - OpenCodeのYAML frontmatter生成でdenyのみの権限カテゴリとfalseのツール設定を省略するようにしました。
20260826 23:00:00 +0900 - OpenCodeのYAML frontmatter生成で、フィルタ後に空になったpermissionとtoolsをnullとして出力するようにしました。
20260827 13:33:32 +0900 - OpenCodeのグローバル`/commit`コマンドをcommandsディレクトリから配置する設定を追加しました。
20260827 14:27:00 +0900 - OpenCodeのグローバル`/commit`コマンドのプロンプトを英語に書き換え、簡潔化しました。
20260827 14:53:15 +0900 - OpenCodeのspec agentにarchitecture-updateスキル権限を追加し、セッション開始時の差分確認と完了後の更新委譲フローへpromptを更新しました。
