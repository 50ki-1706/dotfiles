# homeディレクトリについて

`home/` はHome Manager設定の入口です。

- `home.nix`: ユーザー識別情報、`installPackages`アクティベーションの調整、`modules/`と`hosts/`の明示的なimportを管理します。
- ツールごとの設定は `modules/` に分割しています。ツールとモジュールの対応は `modules/AGENTS.md` を参照してください。
