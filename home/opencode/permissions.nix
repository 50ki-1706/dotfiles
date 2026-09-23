profile:
let
  # Preserve list order: the last matching permission rule wins.
  profiles = {
    global = [
      {
        action = "shell";
        resource = "sudo *";
        effect = "deny";
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
      {
        action = "skill";
        resource = "*";
        effect = "deny";
      }
      {
        action = "skill";
        resource = "gh-cli";
        effect = "allow";
      }
      {
        action = "skill";
        resource = "computer-use";
        effect = "allow";
      }
      {
        action = "skill";
        resource = "orca-cli";
        effect = "allow";
      }
      {
        action = "skill";
        resource = "orchestration";
        effect = "allow";
      }
      {
        action = "graphify*";
        resource = "*";
        effect = "deny";
      }
      {
        action = "chrome-devtools*";
        resource = "*";
        effect = "deny";
      }
      {
        action = "playwright*";
        resource = "*";
        effect = "deny";
      }
    ];

    spec = [
      {
        action = "*";
        resource = "*";
        effect = "deny";
      }
      {
        action = "subagent";
        resource = "explore";
        effect = "allow";
      }
      {
        action = "subagent";
        resource = "general";
        effect = "allow";
      }
      {
        action = "subagent";
        resource = "plan_review";
        effect = "allow";
      }
      {
        action = "question";
        resource = "*";
        effect = "allow";
      }
      {
        action = "skill";
        resource = "gh-cli";
        effect = "allow";
      }
      {
        action = "skill";
        resource = "computer-use";
        effect = "allow";
      }
      {
        action = "skill";
        resource = "orca-cli";
        effect = "allow";
      }
      {
        action = "skill";
        resource = "orchestration";
        effect = "allow";
      }
    ];

    general = [
      {
        action = "subagent";
        resource = "*";
        effect = "deny";
      }
      {
        action = "question";
        resource = "*";
        effect = "deny";
      }
      {
        action = "external_directory";
        resource = "*";
        effect = "deny";
      }
      {
        action = "chrome-devtools*";
        resource = "*";
        effect = "allow";
      }
      {
        action = "playwright*";
        resource = "*";
        effect = "allow";
      }
    ];

    explore = [
      {
        action = "shell";
        resource = "*";
        effect = "deny";
      }
      {
        action = "edit";
        resource = "*";
        effect = "deny";
      }
      {
        action = "subagent";
        resource = "*";
        effect = "deny";
      }
      {
        action = "question";
        resource = "*";
        effect = "deny";
      }
      {
        action = "skill";
        resource = "*";
        effect = "deny";
      }
      {
        action = "external_directory";
        resource = "*";
        effect = "allow";
      }
      {
        action = "execute";
        resource = "*";
        effect = "allow";
      }
      {
        action = "graphify*";
        resource = "*";
        effect = "allow";
      }
    ];

    plan_review = [
      {
        action = "*";
        resource = "*";
        effect = "deny";
      }
      {
        action = "read";
        resource = "*";
        effect = "allow";
      }
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
      {
        action = "glob";
        resource = "*";
        effect = "allow";
      }
      {
        action = "grep";
        resource = "*";
        effect = "allow";
      }
      {
        action = "external_directory";
        resource = "*";
        effect = "allow";
      }
      {
        action = "execute";
        resource = "*";
        effect = "allow";
      }
      {
        action = "graphify*";
        resource = "*";
        effect = "allow";
      }
    ];
  };
in
profiles.${profile}
