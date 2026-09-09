{ ... }:
let
  mcpPath = "/Users/koki/.local/share/mise/shims:/Users/koki/.nix-profile/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";
in
{
  "$schema" = "https://opencode.ai/config.json";
  autoupdate = false;
  model = "opencode-go/omen-alpha";
  small_model = "opencode-go/omen-alpha";
  default_agent = "spec";
  subagent_depth = 2;
  command = {
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
  mcp = {
    chrome-devtools = {
      type = "local";
      cwd = "/Users/koki/.config/opencode";
      command = [
        "npx"
        "-y"
        "chrome-devtools-mcp@1.8.0"
        "--headless"
      ];
      environment = {
        PATH = mcpPath;
        CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS = "1";
      };
      timeout = 60000;
      enabled = true;
    };
    playwright = {
      type = "local";
      cwd = "/Users/koki/.config/opencode";
      command = [
        "npx"
        "-y"
        "@playwright/mcp@0.0.80"
        "--headless"
      ];
      environment = {
        PATH = mcpPath;
      };
      timeout = 60000;
      enabled = true;
    };
    graphify = {
      type = "local";
      command = [
        "uv"
        "run"
        "--with"
        "graphifyy[mcp]"
        "python3"
        "-m"
        "graphify.serve"
        "./graphify-out/graph.json"
      ];
      environment = {
        PATH = mcpPath;
      };
      timeout = 60000;
      enabled = true;
    };
  };
  tools = {
    "graphify*" = false;
    "chrome-devtools*" = false;
    "playwright*" = false;
  };
  agent = import ./agents.nix;
}
