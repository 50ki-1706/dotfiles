let
  mkPermissions = import ./permissions.nix;
in
{
  "$schema" = "https://opencode.ai/config.json";
  default_agent = "spec";
  model = "opencode-go/qwen3.8-flash#medium";
  providers = import ./providers.nix;
  permissions = mkPermissions {
    skill = [
      "gh-cli"
      "computer-use"
      "orca-cli"
      "orchestration"
      "playwright-cli"
    ];
    graphify = "deny";
    chromeDevtools = "deny";
  };
  agents = {
    spec = {
      mode = "primary";
      model = "opencode-go/qwen3.8-flash#medium";
      description = "Plans work, confirms the plan in Japanese, and delegates to built-in subagents.";
      system = builtins.readFile ./prompts/spec.md;
      permissions = mkPermissions {
        denyAll = true;
        shell = "allow";
        read = "allow";
        glob = "allow";
        grep = "allow";
        question = "allow";
        subagent = [
          "explore"
          "general"
          "plan_review"
        ];
        skill = [
          "gh-cli"
          "computer-use"
          "orca-cli"
          "orchestration"
          "playwright-cli"
        ];
      };
    };
    general = {
      model = "opencode-go/deepseek-v4.1-flash#max";
      permissions = mkPermissions {
        subagent = "deny";
        question = "deny";
        externalDirectory = "deny";
        graphify = "allow";
        chromeDevtools = "allow";
      };
    };
    explore = {
      model = "opencode/fledge-alpha-free#max";
      permissions = mkPermissions {
        edit = "deny";
        subagent = "deny";
        question = "deny";
        skill = "deny";
        externalDirectory = "allow";
        execute = "allow";
        graphify = "allow";
      };
    };
    plan_review = {
      mode = "subagent";
      model = "openai/gpt-6-luna#max";
      description = "Reviews plans, difficult design decisions, and consequential changes using read-only evidence.";
      system = builtins.readFile ./prompts/plan_review.md;
      permissions = mkPermissions {
        denyAll = true;
        read = "allow";
        shell = "allow";
        glob = "allow";
        grep = "allow";
        externalDirectory = "allow";
        execute = "allow";
        graphify = "allow";
      };
    };
  };
}
