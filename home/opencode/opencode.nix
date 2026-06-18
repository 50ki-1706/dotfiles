{ ... }:
let
  readPrompt = name: builtins.readFile (./prompts + "/${name}.md");
in
{
  "$schema" = "https://opencode.ai/config.json";
  autoupdate = false;
  model = "openai/gpt-5.5";
  small_model = "openai/gpt-5.4-mini-fast";
  default_agent = "spec";
  watcher = {
    ignore = [
      "node_modules/**"
      "dist/**"
      ".git/**"
      ".agents/archtecture-diff.md"
    ];
  };
  mcp = {
    chrome-devtools = {
      type = "local";
      command = [
        "npx"
        "-y"
        "chrome-devtools-mcp"
      ];
      enabled = true;
    };
  };
  permission = {
    read = {
      "*" = "allow";
      ".env" = "deny";
      "*.env.*" = "deny";
      "*.env.example" = "allow";
      "*.key" = "deny";
      "*.pem" = "deny";
      "id_rsa*" = "deny";
    };
    bash = {
      "*" = "allow";

      # 破壊的操作
      "sudo *" = "deny";
      "rm -rf *" = "deny";
      "chmod 777 *" = "deny";
      "chmod -R 777 *" = "deny";
      "chown -R *" = "deny";
      "dd *" = "deny";
      "shutdown *" = "deny";
      "reboot *" = "deny";
      "halt *" = "deny";

      # パイプインストール
      "curl * | sh" = "deny";
      "curl * | bash" = "deny";
      "wget * | sh" = "deny";
      "wget * | bash" = "deny";

      # Git 破壊的操作
      "git reset --hard *" = "deny";
      "git clean *" = "deny";

      # リモート操作
      "git push*" = "ask";

      # 環境構築
      "brew *" = "ask";
      "nix *" = "ask";
    };
    skill = {
      "*" = "deny";
    };
  };
  agent = {
    deep_explore = {
      mode = "subagent";
      model = "opencode-go/minimax-m3";
      description = "Broad codebase exploration subagent. Scans directories, summarizes architecture, and maintains `.agents/archtecture.md` for reuse.";
      permission = {
        task = {
          "*" = "deny";
        };
        bash = {
          "*" = "deny";
        };
        edit = {
          "*" = "deny";
          ".agents/archtecture.md" = "allow";
        };
      };
      prompt = readPrompt "deep_explore";
      tools = {
        question = false;
        websearch = false;
        webfetch = false;
      };
    };
    executer = {
      mode = "subagent";
      model = "openai/gpt-5.4-mini-fast";
      description = "Implementation and verification subagent. Performs delegated tasks from spec and reports changes plus validation results.";
      permission = {
        task = {
          "*" = "deny";
        };
        bash = {
          "git log*" = "deny";
          "git show*" = "deny";
          "git blame*" = "deny";
        };
        edit = {
          "*" = "allow";
        };
        skill = {
          verify = "allow";
        };
      };
      prompt = readPrompt "execute";
      tools = {
        question = false;
      };
    };
    explore = {
      mode = "subagent";
      model = "opencode-go/deepseek-v4-flash";
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
      };
      prompt = readPrompt "explore";
      tools = {
        question = false;
        websearch = false;
        webfetch = false;
      };
    };
    internet_search = {
      mode = "subagent";
      model = "openai/gpt-5.4-mini";
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
      model = "openai/gpt-5.5";
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
      model = "opencode-go/deepseek-v4-pro";
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
        todowrite = true;
      };
    };
  };
}
