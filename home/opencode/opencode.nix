{ ... }:
{
  "$schema" = "https://opencode.ai/config.json";
  autoupdate = false;
  model = "openai/gpt-5.6-terra";
  small_model = "openai/gpt-5.6-luna";
  default_agent = "spec";
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
  permission = {
    read = {
      "*" = "allow";
      ".env" = "deny";
      ".env.*" = "deny";
      "**/.env" = "deny";
      "**/.env.*" = "deny";
      ".env.example" = "allow";
      "**/.env.example" = "allow";
      "*.key" = "deny";
      "*.pem" = "deny";
      "id_rsa*" = "deny";
    };
    bash = {
      "*" = "allow";

      # 破壊的操作
      "sudo *" = "deny";
      "rm -rf *" = "deny";
      "chmod 777 *" = "deny";
      "chmod -R 777 *" = "deny";
      "chown -R *" = "deny";
      "dd *" = "deny";
      "shutdown *" = "deny";
      "reboot *" = "deny";
      "halt *" = "deny";

      # パイプインストール
      "curl * | sh" = "deny";
      "curl * | bash" = "deny";
      "wget * | sh" = "deny";
      "wget * | bash" = "deny";

      # Git 破壊的操作
      "git reset --hard *" = "deny";
      "git clean *" = "deny";

      # リモート操作
      "git push*" = "ask";

      # 環境構築
      "brew install *" = "ask";
      "brew uninstall *" = "ask";
      "nix run home-manager -- switch --flake . *" = "ask";
    };
    skill = {
      "*" = "deny";
      "gh-cli" = "allow";
    };
  };
  agent = import ./agents.nix;
}
