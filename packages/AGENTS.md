# packagesディレクトリについて

packagesディレクトリは、home-managerとflakeから利用するNixパッケージ定義を管理するためのディレクトリです。自動読み込みは行わず、利用する側から明示的に参照します。

- `ssh-bootstrap.nix`: SSHキーの管理と生成を行うパッケージ定義です。`flake.nix` の `packages` / `apps` として公開され、`scripts/install.sh` から `nix run <repo>#ssh-bootstrap` で利用されます。
- `opencode.nix`: OpenCode CLI本体の固定バージョン定義です。`modules/opencode/default.nix` から `pkgs.callPackage` で読み込まれ、`programs.opencode.package` に設定されます。
