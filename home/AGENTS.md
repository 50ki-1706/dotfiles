# homeディレクトリについて

## home-managerで管理されているツール、ライブラリについて

### `home.packages`で明示的に導入しているもの

| 定義 | 用途 |
| --- | --- |
| `pkgs.fzf` | コマンドラインでの曖昧検索ツール |
| `pkgs.git` | Gitのコマンドラインツール |
| `pkgs.lazygit` | GitリポジトリをターミナルUIで操作するツール |
| `pkgs.devbox` | プロジェクトごとの開発環境を扱うツール |
| `pkgs.nixfmt` | Nixコードのフォーマッタ |
| `pkgs.ripgrep` | 高速なテキスト検索ツール |
| `pkgs.yazi` | ターミナル上のファイルマネージャ |
| `pkgs.zellij` | ターミナルマルチプレクサ |
| `ollamaPkgs.ollama` | ローカルLLM実行ツール |
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
| `home.file.".config/opencode/AGENTS.md"` | `home/opencode/AGENTS.md`をOpenCode用の`~/.config/opencode/AGENTS.md`として配置します。 |
| `home.file.".config/helix/yazi-picker.sh"` | HelixからYaziを開き、選択ファイルをHelixで開く補助スクリプトを配置します。 |
| `home.activation.installPackages` | Home Managerのパッケージ導入処理を、現在のNix CLIに合わせて`nix profile add`へ調整します。 |

### 設定内で補助的に参照しているパッケージ

| 定義 | 用途 |
| --- | --- |
| `pkgs.bash` | `yazi-picker.sh`の実行シェル |
| `pkgs.gnused` | Yaziの`search://`形式のパス整形 |
| `pkgs.ghostty-bin` | Ghosttyの実行パッケージ |

## docsディレクトリについて
- OpenCode: `docs/opencode/README.md`

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
