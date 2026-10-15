# hostsディレクトリについて

`default.nix` は空の拡張点です。プラットフォーム差分は各ツールモジュールで `pkgs.stdenv.isDarwin` を使って表します。
ホスト固有のモジュールが実際に存在する場合に限り、`default.nix` から import します。
