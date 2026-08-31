{ lib, pkgs, ... }:
let
  npx = lib.getExe' pkgs.nodejs "npx";
  nodeEnvironment.PATH = "${
    lib.makeBinPath [
      pkgs.nodejs
      pkgs.bash
    ]
  }:/usr/bin:/bin:/usr/sbin:/sbin";
  uv = lib.getExe' pkgs.uv "uv";
in
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
        npx
        "-y"
        "chrome-devtools-mcp"
        "--headless"
      ];
      environment = nodeEnvironment;
      enabled = true;
    };
    playwright = {
      type = "local";
      command = [
        npx
        "-y"
        "@playwright/mcp@latest"
        "--headless"
      ];
      environment = nodeEnvironment;
      enabled = true;
    };
    graphify = {
      type = "local";
      command = [
        uv
        "run"
        "--with"
        "graphifyy[mcp]"
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
