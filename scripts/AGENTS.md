# 各スクリプトについて

- accounts.sh: GitHubアカウントの管理とSSHキーの生成を行います。
- migrate-legacy-links.sh: 旧レイアウトのGit ignoreとVSCodeリンクをswitch前に安全に移行します。
- install.sh: Nixのインストールと、必要なセットアップを対話的に行います。switch前に`migrate-legacy-links.sh`を実行し、Git ignoreとVSCodeの配置はhome-managerへ委譲します。
- `lib/symlink.sh`: 削除済みです。一般的なシンボリックリンク作成はinstall.shでは行いません。


## EDR timeline
以下のフォーマットで、scriptsディレクト内の変更を記録してください。変更の内容がわかるように、簡潔な説明をつけてください。
例:
```sh
20260529 12:00:00 +0900 - README.mdの簡略化のため、install.shの内容を整備しました。
```
20260615 19:17:12 +0900 - Nix再インストール時に既存のNix Storeボリュームを確認して削除できるよう、install.shを更新しました。
20260623 11:29:00 +0900 - VSCodeのsettings.json / keybindings.jsonをリポジトリ管理へ移行しました。
20260623 12:00:00 +0900 - VSCode設定のシンボリックリンク先をmacOSの`~/Library/Application Support/Code/User/`に整理しました。
20260825 09:23:06 +0900 - Git ignoreとVSCode設定の配置をhome-managerへ移し、install.shから旧シンボリックリンク処理を分離しました。switch前の移行スクリプトを追加し、lib/symlink.shを削除しました。
