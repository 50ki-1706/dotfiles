# configディレクトリについて

このディレクトリは、home-managerではなくインストールスクリプトでシンボリックリンクする、ユーザーが直接編集可能な設定ファイルを置く場所です。

## 管理方針

- ここにあるファイルはリポジトリで追跡し、必要に応じて手動で編集します。
- 各ツールの導入方法は、原則としてここでは管理しません（HomebrewやNixなど、別の仕組みで行います）。
- `scripts/install.sh` 実行時に、各ツールの既定の配置先へシンボリックリンクされます。

## 現在の配置

| パス | リンク先 | 用途 |
| --- | --- | --- |
| `config/Code/User/settings.json` | `~/Library/Application Support/Code/User/settings.json` | VSCodeのユーザー設定です。 |
| `config/Code/User/keybindings.json` | `~/Library/Application Support/Code/User/keybindings.json` | VSCodeのキーバインド設定です。 |

## VSCode設定について

- VSCode本体と拡張機能はHomebrew/Brewfileで管理します。拡張機能一覧はルートの `Brewfile` に `vscode "..."` として記載しています。
- settings.json / keybindings.json はこの `config/Code/User/` で管理し、`scripts/install.sh` で `~/Library/Application Support/Code/User/` へシンボリックリンクします。
- 拡張機能ディレクトリはシンボリックリンクしません。
- Linux で同様の構成を使う場合は、リンク先を `~/.config/Code/User/` に変更してください。ディストリビューションや VSCode 変種（OSS版など）によってパスが異なる可能性があるため、事前に配置先を確認してください。

## EDR timeline
以下のフォーマットで、configディレクト内の変更を記録してください。変更の内容がわかるように、簡潔な説明をつけてください。
例:
```sh
20260529 12:00:00 +0900 - README.mdの簡略化のため、install.shの内容を整備しました。
```

20260623 11:29:00 +0900 - VSCodeのsettings/keybindingsをNix管理から `config/Code/User/` のリポジトリ管理へ移行しました。本体・拡張機能は引き続きHomebrew/Brewfileで管理します。
20260623 12:00:00 +0900 - VSCode設定のシンボリックリンク先を、macOS の `~/Library/Application Support/Code/User/` に変更しました。Linux 利用時は `~/.config/Code/User/` へ変更してください。
