# 各スクリプトについて

- accounts.sh: GitHubアカウントの管理とSSHキーの生成を行います。
- migrate-legacy-links.sh: zshで実行し、旧レイアウトのGit ignoreとVSCodeリンクをswitch前に安全に移行します。
- install.sh: zshで実行し、Nixのインストールと必要なセットアップを対話的に行います。switch前に`migrate-legacy-links.sh`をzshで実行し、Git ignoreとVSCodeの配置はhome-managerへ委譲します。
- check-opencode-actions.sh: OpenCodeのaction空間のドリフトチェッカーです。単体実行もできますが通常はflakeの`packages.opencode-action-check.nix`から`nix run .#opencodeActionCheck`で実行し、`opencode debug agents`とMCPサーバーのstdioイントロスペクション（initialize→tools/listのみ）を`actions.nix`のbaselineと比較します。終了コードは0=driftなし、1=drift、2=判定保留です。
- `lib/symlink.sh`: 削除済みです。一般的なシンボリックリンク作成はinstall.shでは行いません。
