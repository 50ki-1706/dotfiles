# packagesディレクトリについて

packagesディレクトリは、home-managerのパッケージ定義を管理するためのディレクトリです。ここに配置されたファイルは、home-managerの@default.nixで読み込まれ、home-managerの環境構築に使用されます。

@ssh-bootstrap.nixは、SSHキーの管理と生成を行うためのパッケージ定義です。これを使用することで、home-managerのビルド時にSSHキーの生成や管理が自動化されます。

## EDR timeline
以下のフォーマットで、packagesディレクト内の変更を記録してください。変更の内容がわかるように、簡潔な説明をつけてください。
例:
```sh
20260529 12:00:00 +0900 - README.mdの簡略化のため、install.shの内容を整備しました。
```
