let
  mkPermissions = import ./permissions.nix;
in
{
  "$schema" = "https://opencode.ai/config.json";
  default_agent = "spec";
  model = "opencode-go/qwen3.8-flash#medium";
  providers = import ./providers.nix;
  permissions = mkPermissions "global";
  agents = {
    spec = {
      mode = "primary";
      model = "opencode-go/qwen3.8-flash#medium";
      description = "Plans work, confirms the plan in Japanese, and delegates to built-in subagents.";
      system = builtins.readFile ./prompts/spec.md;
      permissions = mkPermissions "spec";
    };
    general = {
      model = "opencode-go/deepseek-v4.1-flash#max";
      permissions = mkPermissions "general";
    };
    explore = {
      model = "opencode/mimo-v2.6-flash-free";
      permissions = mkPermissions "explore";
    };
    plan_review = {
      mode = "subagent";
      model = "openai/gpt-6-luna#max";
      description = "Reviews plans, difficult design decisions, and consequential changes using read-only evidence.";
      system = builtins.readFile ./prompts/plan_review.md;
      permissions = mkPermissions "plan_review";
    };
  };
}
