# shellディレクトリについて

## aliases
このファイルは、シェルのエイリアスを定義しています。
home-managerの@default.nixで、このファイルを読み込む設定をしてます。
このファイルは直接、zshrcなどを上書きしておらず、.config/shell/aliasesを作成し、zshrc側に`source ~/.config/shell/aliases`を追加することで、既存の環境を壊さないようにしています。


## EDR timeline
以下のフォーマットで、shellディレクト内の変更を記録してください。変更の内容がわかるように、簡潔な説明をつけてください。
例:
```sh
20260529 12:00:00 +0900 - README.mdの簡略化のため、install.shの内容を整備しました。
```
