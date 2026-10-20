# hostsディレクトリについて

`default.nix` は空の Home Manager 拡張点です。プラットフォーム差分は各ツールモジュールで `pkgs.stdenv.isDarwin` を使って表します。
例外として `mac.nix` は nix-darwin の Mac ホスト定義で、`flake.nix` からのみ import します。
