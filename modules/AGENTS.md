# modulesディレクトリについて

- リポジトリで管理するHome Managerモジュールを、トップレベルで管理します。
- `mise/default.nix`: `mise/config.toml`を`xdg.configFile`で`~/.config/mise/config.toml`へ読み取り専用（store-backed）で配置します。
- `mise/config.toml`: miseのグローバルツール設定です。変更はこのファイルを編集 → `nix run home-manager -- switch --flake .#koki` → `mise install`の順で行います。
