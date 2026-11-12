# デスクトップ版 dsh は launchd から起動されるため、シェルの PATH を継承しない。
# ワークツリー作成は profile の nodeCommand（既定値 `node`）を PATH 上で解決するので、
# node が無いと「ワークツリーを作成できませんでした」で失敗する。
# runtime はグローバルに入れず、このアプリのためだけに nodejs_24 を PATH へ足す。
# バージョンは nixpkgs の dsh / dsh-TUI と同じ nodejs_24 に揃える。
{
  home =
    { pkgs, ... }:
    {
      home.packages = [ pkgs.nodejs_24 ];
    };
}
