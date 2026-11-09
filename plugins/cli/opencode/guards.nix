# Shared shell, read, and MCP resource guards.
let
  rule = action: resource: effect: { inherit action resource effect; };
in
{
  shellGuards = [
    (rule "shell" "sudo *" "deny")
    (rule "shell"
      "sudo nix --extra-experimental-features nix-command --extra-experimental-features flakes run /Users/koki/.dotfiles#darwin-rebuild -- switch --flake /Users/koki/.dotfiles#mac"
      "ask"
    )
    (rule "shell" "sudo darwin-rebuild switch --flake /Users/koki/.dotfiles#mac" "ask")
    (rule "shell" "rm -rf *" "deny")
    (rule "shell" "chmod 777 *" "deny")
    (rule "shell" "chmod -R 777 *" "deny")
    (rule "shell" "chown -R *" "deny")
    (rule "shell" "dd *" "deny")
    (rule "shell" "shutdown *" "deny")
    (rule "shell" "reboot *" "deny")
    (rule "shell" "halt *" "deny")
    (rule "shell" "curl * | sh" "deny")
    (rule "shell" "curl * | bash" "deny")
    (rule "shell" "wget * | sh" "deny")
    (rule "shell" "wget * | bash" "deny")
    (rule "shell" "git reset --hard *" "deny")
    (rule "shell" "git clean *" "deny")
    (rule "shell" "git push*" "ask")
    (rule "shell" "brew install *" "ask")
    (rule "shell" "brew uninstall *" "ask")
    (rule "shell" "nix run home-manager -- switch *" "ask")
  ];

  secretReadGuards = [
    (rule "read" ".env" "deny")
    (rule "read" ".env.*" "deny")
    (rule "read" "**/.env" "deny")
    (rule "read" "**/.env.*" "deny")
    (rule "read" ".env.example" "allow")
    (rule "read" "**/.env.example" "allow")
    (rule "read" "*.key" "deny")
    (rule "read" "*.pem" "deny")
    (rule "read" "id_rsa*" "deny")
    (rule "read" "**/id_rsa*" "deny")
  ];

  # Pinned OpenCode checks server names for list and `server:uri` for read.
  # Keep Figma resources denied: the tool action grants in actions.nix are
  # independent of resource enumeration, and list-without-server stays denied.
  mcpResourceGuards = [
    (rule "opencode_list_mcp_resources" "figma*" "deny")
    (rule "opencode_read_mcp_resource" "figma*" "deny")
  ];
}
