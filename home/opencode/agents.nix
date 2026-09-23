let
  permission = action: resource: effect: { inherit action resource effect; };
  readPermissions = [
    (permission "read" ".env" "deny")
    (permission "read" ".env.*" "deny")
    (permission "read" "**/.env" "deny")
    (permission "read" "**/.env.*" "deny")
    (permission "read" ".env.example" "allow")
    (permission "read" "**/.env.example" "allow")
    (permission "read" "*.key" "deny")
    (permission "read" "*.pem" "deny")
    (permission "read" "id_rsa*" "deny")
    (permission "read" "**/id_rsa*" "deny")
  ];
  skillPermissions = [
    (permission "skill" "gh-cli" "allow")
    (permission "skill" "computer-use" "allow")
    (permission "skill" "orca-cli" "allow")
    (permission "skill" "orchestration" "allow")
  ];
in
{
  "$schema" = "https://opencode.ai/config.json";
  default_agent = "spec";
  model = "opencode-go/qwen3.8-flash#medium";
  providers = import ./providers.nix;
  permissions = [
    (permission "shell" "sudo *" "deny")
    (permission "shell" "rm -rf *" "deny")
    (permission "shell" "chmod 777 *" "deny")
    (permission "shell" "chmod -R 777 *" "deny")
    (permission "shell" "chown -R *" "deny")
    (permission "shell" "dd *" "deny")
    (permission "shell" "shutdown *" "deny")
    (permission "shell" "reboot *" "deny")
    (permission "shell" "halt *" "deny")
    (permission "shell" "curl * | sh" "deny")
    (permission "shell" "curl * | bash" "deny")
    (permission "shell" "wget * | sh" "deny")
    (permission "shell" "wget * | bash" "deny")
    (permission "shell" "git reset --hard *" "deny")
    (permission "shell" "git clean *" "deny")
    (permission "shell" "git push*" "ask")
    (permission "shell" "brew install *" "ask")
    (permission "shell" "brew uninstall *" "ask")
    (permission "shell" "nix run home-manager -- switch *" "ask")
  ]
  ++ readPermissions
  ++ [ (permission "skill" "*" "deny") ]
  ++ skillPermissions
  ++ [
    (permission "graphify*" "*" "deny")
    (permission "chrome-devtools*" "*" "deny")
    (permission "playwright*" "*" "deny")
  ];
  agents = {
    spec = {
      mode = "primary";
      model = "opencode-go/qwen3.8-flash#medium";
      description = "Plans work, confirms the plan in Japanese, and delegates to built-in subagents.";
      system = builtins.readFile ./prompts/spec.md;
      permissions = [
        (permission "*" "*" "deny")
        (permission "subagent" "explore" "allow")
        (permission "subagent" "general" "allow")
        (permission "subagent" "plan_review" "allow")
        (permission "question" "*" "allow")
      ]
      ++ skillPermissions;
    };
    general = {
      model = "opencode-go/deepseek-v4.1-flash#max";
      permissions = [
        (permission "subagent" "*" "deny")
        (permission "question" "*" "deny")
        (permission "external_directory" "*" "deny")
        (permission "chrome-devtools*" "*" "allow")
        (permission "playwright*" "*" "allow")
      ];
    };
    explore = {
      model = "opencode/mimo-v2.6-flash-free";
      permissions = [
        (permission "shell" "*" "deny")
        (permission "edit" "*" "deny")
        (permission "subagent" "*" "deny")
        (permission "question" "*" "deny")
        (permission "skill" "*" "deny")
        (permission "external_directory" "*" "allow")
        (permission "execute" "*" "allow")
        (permission "graphify*" "*" "allow")
      ];
    };
    plan_review = {
      mode = "subagent";
      model = "openai/gpt-6-luna#max";
      description = "Reviews plans, difficult design decisions, and consequential changes using read-only evidence.";
      system = builtins.readFile ./prompts/plan_review.md;
      permissions = [
        (permission "*" "*" "deny")
        (permission "read" "*" "allow")
      ]
      ++ readPermissions
      ++ [
        (permission "glob" "*" "allow")
        (permission "grep" "*" "allow")
        (permission "external_directory" "*" "allow")
        (permission "execute" "*" "allow")
        (permission "graphify*" "*" "allow")
      ];
    };
  };
}
