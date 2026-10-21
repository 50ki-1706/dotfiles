# Shared shell, read, and MCP resource guards.
{
  shellGuards = [
    {
      action = "shell";
      resource = "sudo *";
      effect = "deny";
    }
    {
      action = "shell";
      resource = "sudo nix --extra-experimental-features nix-command --extra-experimental-features flakes run /Users/koki/.dotfiles#darwin-rebuild -- switch --flake /Users/koki/.dotfiles#mac";
      effect = "ask";
    }
    {
      action = "shell";
      resource = "sudo darwin-rebuild switch --flake /Users/koki/.dotfiles#mac";
      effect = "ask";
    }
    {
      action = "shell";
      resource = "rm -rf *";
      effect = "deny";
    }
    {
      action = "shell";
      resource = "chmod 777 *";
      effect = "deny";
    }
    {
      action = "shell";
      resource = "chmod -R 777 *";
      effect = "deny";
    }
    {
      action = "shell";
      resource = "chown -R *";
      effect = "deny";
    }
    {
      action = "shell";
      resource = "dd *";
      effect = "deny";
    }
    {
      action = "shell";
      resource = "shutdown *";
      effect = "deny";
    }
    {
      action = "shell";
      resource = "reboot *";
      effect = "deny";
    }
    {
      action = "shell";
      resource = "halt *";
      effect = "deny";
    }
    {
      action = "shell";
      resource = "curl * | sh";
      effect = "deny";
    }
    {
      action = "shell";
      resource = "curl * | bash";
      effect = "deny";
    }
    {
      action = "shell";
      resource = "wget * | sh";
      effect = "deny";
    }
    {
      action = "shell";
      resource = "wget * | bash";
      effect = "deny";
    }
    {
      action = "shell";
      resource = "git reset --hard *";
      effect = "deny";
    }
    {
      action = "shell";
      resource = "git clean *";
      effect = "deny";
    }
    {
      action = "shell";
      resource = "git push*";
      effect = "ask";
    }
    {
      action = "shell";
      resource = "brew install *";
      effect = "ask";
    }
    {
      action = "shell";
      resource = "brew uninstall *";
      effect = "ask";
    }
    {
      action = "shell";
      resource = "nix run home-manager -- switch *";
      effect = "ask";
    }
  ];

  secretReadGuards = [
    {
      action = "read";
      resource = ".env";
      effect = "deny";
    }
    {
      action = "read";
      resource = ".env.*";
      effect = "deny";
    }
    {
      action = "read";
      resource = "**/.env";
      effect = "deny";
    }
    {
      action = "read";
      resource = "**/.env.*";
      effect = "deny";
    }
    {
      action = "read";
      resource = ".env.example";
      effect = "allow";
    }
    {
      action = "read";
      resource = "**/.env.example";
      effect = "allow";
    }
    {
      action = "read";
      resource = "*.key";
      effect = "deny";
    }
    {
      action = "read";
      resource = "*.pem";
      effect = "deny";
    }
    {
      action = "read";
      resource = "id_rsa*";
      effect = "deny";
    }
    {
      action = "read";
      resource = "**/id_rsa*";
      effect = "deny";
    }
  ];

  # Pinned OpenCode checks server names for list and `server:uri` for read.
  # Keep Figma resources denied while its tools remain outside the baseline.
  mcpResourceGuards = [
    {
      action = "opencode_list_mcp_resources";
      resource = "figma*";
      effect = "deny";
    }
    {
      action = "opencode_read_mcp_resource";
      resource = "figma*";
      effect = "deny";
    }
  ];
}
