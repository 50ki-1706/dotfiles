# 各スクリプトについて

- accounts.sh: GitHubアカウントの管理とSSHキーの生成を行います。
- migrate-legacy-links.sh: zshで実行し、旧レイアウトのGit ignoreとVSCodeリンクをswitch前に安全に移行します。
- install.sh: zshで実行し、Nixのインストールと必要なセットアップを対話的に行います。switch前に`migrate-legacy-links.sh`をzshで実行し、Git ignoreとVSCodeの配置はhome-managerへ委譲します。
- `lib/symlink.sh`: 削除済みです。一般的なシンボリックリンク作成はinstall.shでは行いません。
