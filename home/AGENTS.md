# homeディレクトリについて

## home-managerで管理されているツール、ライブラリについて

### `home.packages`で明示的に導入しているもの

| 定義 | 用途 |
| --- | --- |
| `pkgs.fzf` | コマンドラインでの曖昧検索ツール |
| `pkgs.git` | Gitのコマンドラインツール |
| `pkgs.lazygit` | GitリポジトリをターミナルUIで操作するツール |
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
| `programs.ssh` | SSH設定を有効化し、GitHub用の鍵とmacOS Keychain連携を設定します。 |
| `programs.opencode` | OpenCode CLIを有効化し、`home/opencode/opencode.nix`の設定を適用します。 |
| `programs.helix` | Helixエディタを有効化し、テーマ、キー設定、Nixの自動フォーマットを設定します。 |
| `programs.ghostty` | Ghosttyを有効化し、起動時に`zellij attach -c ghostty`を実行するよう設定します。 |

### その他の管理対象

| 定義 | 用途 |
| --- | --- |
| `fonts.fontconfig.enable` | fontconfigベースのアプリでHome Manager管理フォントを利用できるようにします。 |
| `home.activation.installFonts` | macOSネイティブアプリ向けにNerd Fontを`~/Library/Fonts/HomeManager`へコピーします。 |
| `home.file.".config/shell/aliases"` | `shell/aliases`を`~/.config/shell/aliases`として配置します。 |
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
- VSCodeの `settings.json` / `keybindings.json` は `config/Code/User/` で管理し、`scripts/install.sh` で `~/Library/Application Support/Code/User/` へシンボリックリンクします。
- `home/vscode/` によるNix管理は廃止しました。
- Linux で同様の構成を使う場合は、リンク先を `~/.config/Code/User/` に変更してください。ディストリビューションや VSCode 変種によってパスが異なる可能性があるため、事前に確認してください。

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
20260623 11:29:00 +0900 - VSCodeをNix管理（programs.vscode, home/vscode/）からHomebrew/Brewfile + `config/Code/User/` シンボリックリンク管理へ移行しました。
20260623 12:00:00 +0900 - VSCode設定のシンボリックリンク先を、macOS の `~/Library/Application Support/Code/User/` に限定しました。Linux 利用時は `~/.config/Code/User/` への変更が必要です。
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
