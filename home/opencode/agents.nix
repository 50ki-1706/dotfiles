let
  readPrompt = name: builtins.readFile (./prompts + "/${name}.md");
in
{
  deep_explore = {
    mode = "subagent";
    model = "openai/gpt-5.6-sol-fast";
    reasoningEffort = "high";
    description = "Broad codebase exploration subagent. Scans directories, summarizes architecture, and maintains `.agents/architecture.md` for reuse.";
    permission = {
      task = {
        "*" = "deny";
      };
      bash = {
        "*" = "deny";
      };
      edit = {
        "*" = "deny";
        ".agents/architecture.md" = "allow";
        "**/.agents/architecture.md" = "allow";
      };
    };
    prompt = readPrompt "deep_explore";
    tools = {
      question = false;
      websearch = false;
      webfetch = false;
      "graphify*" = true;
    };
  };
  executer = {
    mode = "subagent";
    model = "openai/gpt-5.6-luna-fast";
    reasoningEffort = "max";
    description = "Implementation and verification subagent. Performs delegated tasks from spec and reports changes plus validation results.";
    permission = {
      task = {
        "*" = "deny";
      };
      edit = {
        "*" = "allow";
      };
    };
    prompt = readPrompt "execute";
    tools = {
      question = false;
      "chrome-devtools*" = true;
      "playwright*" = true;
    };
  };
  explore = {
    mode = "subagent";
    model = "opencode-go/mimo-v2.5";
    description = "Read-only targeted code investigation subagent. Activated by a primary agent when it needs focused understanding of a specific part of the codebase (typically ~5 files or fewer). Returns concrete findings to the caller.";
    permission = {
      task = {
        "*" = "deny";
      };
      bash = {
        "*" = "deny";
      };
      edit = {
        "*" = "deny";
      };
      external_directory = "allow";
    };
    prompt = readPrompt "explore";
    tools = {
      question = false;
      websearch = false;
      webfetch = false;
      "graphify*" = true;
    };
  };
  internet_search = {
    mode = "subagent";
    model = "opencode-go/mimo-v2.5";
    description = "External research subagent. Collects outside knowledge and reports sourced findings to spec.";
    permission = {
      task = {
        "*" = "deny";
      };
      bash = {
        "*" = "deny";
      };
      edit = {
        "*" = "deny";
      };
      read = {
        "*" = "deny";
      };
      grep = {
        "*" = "deny";
      };
      glob = {
        "*" = "deny";
      };
      list = {
        "*" = "deny";
      };
    };
    prompt = readPrompt "internet_search";
    tools = {
      websearch = true;
      webfetch = true;
      question = false;
    };
  };
  plan_review = {
    mode = "subagent";
    model = "opencode-go/ox-alpha-free";
    reasoningEffort = "high";
    description = "Plan review subagent. Reviews spec's implementation plan before user confirmation and execution.";
    permission = {
      task = {
        "*" = "deny";
      };
      bash = {
        "*" = "deny";
      };
      edit = {
        "*" = "deny";
      };
      read = {
        "*" = "deny";
      };
      grep = {
        "*" = "deny";
      };
      glob = {
        "*" = "deny";
      };
      list = {
        "*" = "deny";
      };
    };
    prompt = readPrompt "plan_review";
    tools = {
      question = false;
      websearch = false;
      webfetch = false;
    };
  };
  spec = {
    mode = "primary";
    model = "opencode-go/qwen3.7-plus";
    description = "Primary orchestration and user-interface agent. Plans with subagents, gets user confirmation in Japanese, then delegates execution.";
    permission = {
      task = {
        "*" = "deny";
        internet_search = "allow";
        explore = "allow";
        deep_explore = "allow";
        executer = "allow";
        plan_review = "allow";
      };
      bash = {
        "*" = "deny";
      };
      edit = {
        "*" = "deny";
      };
      read = {
        "*" = "deny";
      };
      grep = {
        "*" = "deny";
      };
      glob = {
        "*" = "deny";
      };
      list = {
        "*" = "deny";
      };
    };
    prompt = readPrompt "spec";
    tools = {
      websearch = false;
      webfetch = false;
      question = true;
      todowrite = false;
    };
  };
}
