let
  commonSkills = [
    "gh-cli"
    "playwright-cli"
  ];
  mkPermissions = import ./permissions.nix;
in
{
  "$schema" = "https://opencode.ai/config.json";
  default_agent = "spec";
  model = "openai/gpt-6.1-sol#xhigh";
  providers = import ./providers.nix;
  permissions = mkPermissions {
    shell = "guarded";
    read = "guarded";
    glob = "inherit";
    grep = "inherit";
    edit = "inherit";
    question = "inherit";
    externalDirectory = "inherit";
    webfetch = "inherit";
    websearch = "inherit";
    opencodeTools = "inherit";
    subagent = "inherit";
    execute = "inherit";
    skill = commonSkills;
    graphify = "deny";
    chromeDevtools = "deny";
    figma = "read";
  };
  # Keep Japanese dialogue/planning on Sol; use Zen free primaries only for workers.
  # Review uses a separate model so it provides another perspective.
  # Ordered fallback chains are validated in packages/opencode-model-fallback/chains.nix.
  agents = {
    spec = {
      mode = "primary";
      model = "openai/gpt-6.1-sol#xhigh";
      description = "Plans work, confirms the plan in Japanese, and delegates to built-in subagents.";
      system = builtins.readFile ./prompts/spec.md;
      permissions = mkPermissions {
        denyAll = true;
        shell = "allow";
        read = "allow";
        glob = "allow";
        grep = "allow";
        edit = "deny";
        question = "allow";
        externalDirectory = "inherit";
        webfetch = "inherit";
        websearch = "inherit";
        opencodeTools = "inherit";
        subagent = [
          "explore"
          "general"
          "plan_review"
        ];
        skill = commonSkills;
        execute = "inherit";
        graphify = "allow";
        chromeDevtools = "inherit";
        figma = "read";
      };
    };
    general = {
      model = "opencode/deepseek-v4.1-flash-free#max";
      permissions = mkPermissions {
        denyAll = true;
        shell = "allow";
        read = "allow";
        glob = "allow";
        grep = "allow";
        edit = "allow";
        question = "deny";
        externalDirectory = "deny";
        webfetch = "allow";
        websearch = "allow";
        opencodeTools = "allow";
        subagent = "deny";
        skill = commonSkills;
        execute = "allow";
        graphify = "allow";
        chromeDevtools = "allow";
        figma = "write";
      };
    };
    explore = {
      mode = "subagent";
      model = "opencode/mimo-v2.6-flash-free";
      description = "Deep-investigation subagent for external research, architecture understanding, and thorough codebase analysis; shallow lookups belong to spec.";
      system = builtins.readFile ./prompts/explore.md;
      permissions = mkPermissions {
        denyAll = true;
        shell = "guarded";
        read = "allow";
        glob = "allow";
        grep = "allow";
        edit = "deny";
        question = "deny";
        externalDirectory = "allow";
        webfetch = "allow";
        websearch = "allow";
        opencodeTools = "inherit";
        subagent = "deny";
        skill = "deny";
        execute = "allow";
        graphify = "allow";
        chromeDevtools = "inherit";
        figma = "read";
      };
    };
    plan_review = {
      mode = "subagent";
      model = "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free#high";
      description = "Reviews plans, difficult design decisions, and consequential changes using read-only evidence.";
      system = builtins.readFile ./prompts/plan_review.md;
      permissions = mkPermissions {
        denyAll = true;
        read = "allow";
        shell = "guarded";
        glob = "allow";
        grep = "allow";
        edit = "deny";
        question = "deny";
        externalDirectory = "allow";
        webfetch = "inherit";
        websearch = "inherit";
        opencodeTools = "inherit";
        subagent = "deny";
        skill = "deny";
        execute = "allow";
        graphify = "allow";
        chromeDevtools = "inherit";
        figma = "read";
      };
    };
  };
}
