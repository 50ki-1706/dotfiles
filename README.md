# .dotfiles

このリポジトリには、`opencode` の設定一式と、それをローカル環境へ配置するためのスクリプトが入っています。

## 使い方

Ubuntu 24.04 では、リポジトリのルートで `install.sh` を実行すると、`opencode/` 配下の設定ファイルが `~/.config/opencode/` に symlink されます。

```bash
./install.sh
```

## install.sh について

`install.sh` は次のファイルを配置します。

- `opencode/AGENTS.md` -> `~/.config/opencode/AGENTS.md`
- `opencode/opencode.json` -> `~/.config/opencode/opencode.json`

動作条件は Ubuntu 24.04 のみです。既存ファイルがある場合は、symlink が同じならそのまま、別内容ならバックアップを作成してから置き換えます。

## 関連ファイル

- [install.sh](install.sh)
- [opencode/README.md](opencode/README.md)
