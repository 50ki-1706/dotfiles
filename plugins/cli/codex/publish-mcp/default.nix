{
  home =
    { pkgs, ... }:
    {
      # publish を Codex CLI の MCP サーバーとして使えるようにする。
      # 登録は ~/.codex/config.toml に 1 行足す (Codex が生成・管理する
      # ファイルなので、ここでは上書きしない):
      #
      #   [mcp_servers.publish]
      #   command = "/Users/koki/.nix-profile/bin/publish-mcp"
      home.packages = [ (pkgs.callPackage ./package.nix { }) ];
    };
}
