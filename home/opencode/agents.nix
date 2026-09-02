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
    model = "opencode-go/minimax-m3";
    description = "Broad codebase exploration subagent. Scans directories and summarizes architecture for reuse. Delegates an architecture.md refresh to executer when .agents/architecture-diff.md is not CURRENT.";
    permission = mkPermission {
      task = [ "executer" ];
      bash = "deny";
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
  executer = mkAgent "execute" {
    mode = "subagent";
    model = "openai/gpt-5.6-luna-fast";
    reasoningEffort = "max";
    description = "Implementation and verification subagent. Performs the delegated task and reports changes plus validation results.";
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
    model = "opencode-go/qwen3.8-flash";
    description = "Read-only targeted code investigation subagent. Investigates a specific part of the codebase (typically ~5 files or fewer) as requested and returns concrete findings.";
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
    model = "opencode-go/longcat-2.0";
    description = "External research subagent. Collects outside knowledge and reports sourced findings.";
    permission = mkPermission { };
    tools = {
      websearch = true;
      webfetch = true;
      question = false;
    };
  };
  plan_review = mkAgent "plan_review" {
    mode = "subagent";
    model = "openai/gpt-5.6-sol-fast";
    reasoningEffort = "high";
    description = "Plan review subagent. Reviews an implementation plan before execution.";
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
  spec = mkAgent "spec" {
    mode = "primary";
    model = "opencode-go/glm-5.3-flash";
    description = "Primary orchestration and user-interface agent. Plans with subagents, gets user confirmation in Japanese, then delegates execution.";
    permission = mkPermission {
      task = [
        "explore"
        "deep_explore"
        "executer"
        "internet_search"
        "plan_review"
      ];
      skill = {
        "*" = "deny";
        "gh-cli" = "allow";
      };
    };
    tools = {
      websearch = false;
      webfetch = false;
      question = true;
      todowrite = true;
    };
  };
}
