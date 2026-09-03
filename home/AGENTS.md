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
| `pkgs.nodejs` | Node.js実行環境。MCPサーバー起動(npx)に使用 |
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
