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
  # Keep long-running orchestration within context while retaining recent
  # requirements, reviewed plans, and worker results. Leave buffer model-scaled.
  compaction = {
    auto = true;
    keep.tokens = 20000;
  };
  # Full oversized output remains on disk for targeted follow-up reads.
  tool_output = {
    max_lines = 2000;
    max_bytes = 51200;
  };
  snapshots = true;
  # Root (depth 0) may delegate; workers (depth 1) may not delegate again.
  experimental.subagent_depth = 1;
  commands = {
    commit = {
      template = builtins.readFile ./commands/commit.md;
      description = "セッションの変更をConventional Commitsでコミット";
    };
    create-pr = {
      template = builtins.readFile ./commands/create-pr.md;
      description = "セッションの変更からConventional Commits形式のタイトルでPRを作成";
    };
    codex-refactor = {
      template = builtins.readFile ./commands/codex-refactor.md;
      description = "セッションの変更をCodexでリファクタリング";
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
