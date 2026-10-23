{ pkgs }:
let
  mcpPath = "/Users/koki/.nix-profile/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";
  mcpTimeout = {
    startup = 60000;
    catalog = 60000;
  };
in
(import ./agents.nix)
// {
  update = "disable";
  commands = {
    commit = {
      template = builtins.readFile ./commands/commit.md;
      description = "セッションの変更をConventional Commitsでコミット";
    };
    create-pr = {
      template = builtins.readFile ./commands/create-pr.md;
      description = "セッションの変更からConventional Commits形式のタイトルでPRを作成";
    };
  };
  watcher = {
    ignore = [
      "node_modules/**"
      "dist/**"
      ".git/**"
      ".next/**"
      "__pycache__/**"
      "**/__pycache__/**"
      ".venv/**"
      "venv/**"
    ];
  };
  mcp.servers = {
    # Keep the `figma` credential ID and runtime OAuth callback defaults;
    # the schema's redirect_uri default is incompatible with Figma.
    figma = {
      type = "remote";
      url = "https://mcp.figma.com/mcp";
      codemode = false;
      timeout = mcpTimeout;
    };
    chrome-devtools = {
      type = "local";
      cwd = "/Users/koki/.config/opencode";
      command = [
        (pkgs.lib.getExe' pkgs.nodejs_24 "npx")
        "-y"
        "chrome-devtools-mcp@1.8.0"
        "--headless"
      ];
      environment = {
        PATH = "${pkgs.nodejs_24}/bin:${mcpPath}";
        CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS = "1";
      };
      timeout = mcpTimeout;
    };
    graphify = {
      type = "local";
      command = [
        (pkgs.lib.getExe pkgs.uv)
        "run"
        "--with"
        "graphifyy[mcp]"
        "python3"
        "-m"
        "graphify.serve"
        "./graphify-out/graph.json"
      ];
      environment = {
        PATH = "${pkgs.uv}/bin:${mcpPath}";
      };
      timeout = mcpTimeout;
    };
  };
}
