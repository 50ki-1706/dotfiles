# 各スクリプトについて

- accounts.sh: GitHubアカウントの管理とSSHキーの生成を行います。
- symlink.sh: dotfilesのシンボリックリンクを作成します。
- install.sh: Nixのインストールと、必要なセットアップを対話的に行います。git global ignore と VSCode の settings.json / keybindings.json をシンボリックリンクします（VSCode設定のリンク先は macOS の `~/Library/Application Support/Code/User/` です）。


## EDR timeline
以下のフォーマットで、scriptsディレクト内の変更を記録してください。変更の内容がわかるように、簡潔な説明をつけてください。
例:
```sh
20260529 12:00:00 +0900 - README.mdの簡略化のため、install.shの内容を整備しました。
```
20260615 19:17:12 +0900 - Nix再インストール時に既存のNix Storeボリュームを確認して削除できるよう、install.shを更新しました。
20260623 11:29:00 +0900 - VSCodeのsettings.json / keybindings.json を `config/Code/User/` から `~/.config/Code/User/` へシンボリックリンクする処理をinstall.shに追加しました。
20260623 12:00:00 +0900 - VSCode設定のシンボリックリンク先を macOS の `~/Library/Application Support/Code/User/` に変更し、Linux 利用時は `~/.config/Code/User/` に変更することを記載しました。
