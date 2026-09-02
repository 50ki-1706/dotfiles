{ ... }:
{
  "$schema" = "https://opencode.ai/config.json";
  autoupdate = false;
  model = "opencode-go/deepseek-v4-flash";
  small_model = "opencode-go/deepseek-v4-flash";
  provider.opencode-go.models.minimax-m3.options.thinking = {
    type = "enabled";
    budgetTokens = 16000;
  };
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
      command = [
        "npx"
        "-y"
        "chrome-devtools-mcp"
        "--headless"
      ];
      enabled = true;
    };
    playwright = {
      type = "local";
      command = [
        "npx"
        "-y"
        "@playwright/mcp@latest"
        "--headless"
      ];
      enabled = true;
    };
    graphify = {
      type = "local";
      command = [
        "uv"
        "run"
        "--with"
        "graphifyy"
        "python3"
        "-m"
        "graphify.serve"
        "./graphify-out/graph.json"
      ];
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
