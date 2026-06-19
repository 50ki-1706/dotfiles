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
| `programs.vscode` | VSCodeを有効化し、settings/keybindings/extensionsを`home/vscode/`で管理します。 |

### その他の管理対象

| 定義 | 用途 |
| --- | --- |
| `fonts.fontconfig.enable` | fontconfigベースのアプリでHome Manager管理フォントを利用できるようにします。 |
| `home.activation.installFonts` | macOSネイティブアプリ向けにNerd Fontを`~/Library/Fonts/HomeManager`へコピーします。 |
| `home.file.".config/shell/aliases"` | `shell/aliases`を`~/.config/shell/aliases`として配置します。 |
| `home.file.".config/zellij/layouts/ide.kdl"` | `ide`関数で開くZellijレイアウトを配置します。 |
| `home.file.".config/opencode/AGENTS.md"` | `home/opencode/AGENTS.md`をOpenCode用の`~/.config/opencode/AGENTS.md`として配置します。 |
| `home.file.".config/helix/yazi-picker.sh"` | HelixからYaziを開き、選択ファイルをHelixで開く補助スクリプトを配置します。 |
| `home.file.".config/vscode/"` | `config/vscode/`は凍結済み（参照専用・編集禁止）です。VSCodeのsettings/keybindings/extensionsは`home/vscode/vscode.nix`をsource of truthとして管理します。 |
| `home.activation.installPackages` | Home Managerのパッケージ導入処理を、現在のNix CLIに合わせて`nix profile add`へ調整します。 |

### 設定内で補助的に参照しているパッケージ

| 定義 | 用途 |
| --- | --- |
| `pkgs.bash` | `yazi-picker.sh`の実行シェル |
| `pkgs.gnused` | Yaziの`search://`形式のパス整形 |
| `pkgs.ghostty-bin` | Ghosttyの実行パッケージ |

## docsディレクトリについて
- OpenCode: `docs/opencode/README.md`

## ロールバック
- `home/default.nix` から `./vscode/vscode.nix` のimportを削除して `home-manager switch` を再実行します。
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
