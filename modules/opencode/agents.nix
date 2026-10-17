let
  commonSkills = [
    "gh-cli"
    "computer-use"
    "orca-cli"
    "orchestration"
    "playwright-cli"
  ];
  mkPermissions = import ./permissions.nix;
in
{
  "$schema" = "https://opencode.ai/config.json";
  default_agent = "spec";
  model = "xai/grok-4.7#high";
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
  };
  # Ordered fallback chains are validated against these primary models in packages/opencode-model-fallback/chains.nix.
  agents = {
    spec = {
      mode = "primary";
      model = "xai/grok-4.7#high";
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
      };
    };
    general = {
      model = "openai/gpt-6-luna#max";
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
      };
    };
    explore = {
      mode = "subagent";
      model = "opencode/glm-5.3-flash-free#high";
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
      };
    };
    plan_review = {
      mode = "subagent";
      model = "openai/gpt-6.1-sol#xhigh";
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
      };
    };
  };
}
