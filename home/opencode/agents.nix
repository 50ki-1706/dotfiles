let
  mkPermission = import ./permissions.nix;
  toYamlFrontmatter = import ./yaml.nix;

  commonOutputFormat = builtins.readFile ./prompts/output-format.md;
  readPrompt = name: builtins.readFile (./prompts + "/${name}.md");
  mkAgent =
    name: config:
    config
    // {
      prompt = toYamlFrontmatter config + "\n" + readPrompt name + "\n" + commonOutputFormat;
    };
in
{
  deep_explore = mkAgent "deep_explore" {
    mode = "subagent";
    model = "openai/gpt-5.6-sol-fast";
    reasoningEffort = "high";
    description = "Broad codebase exploration subagent. Scans directories and summarizes architecture for reuse.";
    permission = mkPermission {
      bash = "deny";
      edit = {
        ".agents/architecture.md" = "allow";
        "*/.agents/architecture.md" = "allow";
        ".agents/archtecture.md" = "allow";
        "*/.agents/archtecture.md" = "allow";
      };
    };
    tools = {
      question = false;
      websearch = false;
      webfetch = false;
      "graphify*" = true;
    };
  };
  executer = mkAgent "execute" {
    mode = "subagent";
    model = "openai/gpt-5.6-luna-fast";
    reasoningEffort = "max";
    description = "Implementation and verification subagent. Performs delegated tasks from spec and reports changes plus validation results.";
    permission = mkPermission {
      bash = "allow";
      read = "allow";
      edit = "allow";
      skill = "allow";
    };
    tools = {
      question = false;
      "chrome-devtools*" = true;
      "playwright*" = true;
    };
  };
  explore = mkAgent "explore" {
    mode = "subagent";
    model = "opencode-go/mimo-v2.5";
    description = "Read-only targeted code investigation subagent. Activated by a primary agent when it needs focused understanding of a specific part of the codebase (typically ~5 files or fewer). Returns concrete findings to the caller.";
    permission = mkPermission {
      read = "allow";
      grep = "allow";
      glob = "allow";
      list = "allow";
      external_directory = "allow";
    };
    tools = {
      question = false;
      websearch = false;
      webfetch = false;
      "graphify*" = true;
    };
  };
  internet_search = mkAgent "internet_search" {
    mode = "subagent";
    model = "opencode-go/mimo-v2.5";
    description = "External research subagent. Collects outside knowledge and reports sourced findings to spec.";
    permission = mkPermission { };
    tools = {
      websearch = true;
      webfetch = true;
      question = false;
    };
  };
  plan_review = mkAgent "plan_review" {
    mode = "subagent";
    model = "opencode-go/ox-alpha-free";
    reasoningEffort = "max";
    description = "Plan review subagent. Reviews spec's implementation plan before user confirmation and execution.";
    permission = mkPermission { };
    tools = {
      question = false;
      websearch = false;
      webfetch = false;
    };
  };
  spec = mkAgent "spec" {
    mode = "primary";
    model = "opencode-go/qwen3.7-plus";
    description = "Primary orchestration and user-interface agent. Plans with subagents, gets user confirmation in Japanese, then delegates execution.";
    permission = mkPermission {
      task = [
        "explore"
        "deep_explore"
        "executer"
        "internet_search"
        "plan_review"
      ];
    };
    tools = {
      websearch = false;
      webfetch = false;
      question = true;
      todowrite = false;
    };
  };
}
