{ ... }:
let
  readPrompt = name: builtins.readFile (./prompts + "/${name}.md");
in
{
    "$schema" = "https://opencode.ai/config.json";
    autoupdate = false;
    model = "openai/gpt-5.4-fast";
    small_model = "openai/gpt-5.4-mini-fast";
    default_agent = "spec";
    watcher = {
      ignore = [
        "node_modules/**"
        "dist/**"
        ".git/**"
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
        "*" = "ask";
        "sudo *" = "deny";
        "rm -rf *" = "deny";
        "curl * | sh" = "deny";
        "wget * | sh" = "deny";
        "git reset --hard *" = "deny";
        "git clean -fdx *" = "deny";
      };
      skill = {
        "*" = "deny";
      };
    };
    agent = {
      build = {
        mode = "subagent";
        hidden = true;
        disable = true;
      };
      deep_explore = {
        mode = "subagent";
        model = "openai/gpt-5.3-codex";
        description = "Read-only broad codebase investigation subagent. Activated when architecture-level understanding is needed — cross-module dependencies, call graphs, or repository-wide conventions. Additionally recommends specific targets for follow-up `explore` investigation.";
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
        prompt = readPrompt "deep_explore";
        tools = {
          question = false;
          websearch = false;
          webfetch = false;
        };
      };
      execute = {
        mode = "subagent";
        model = "openai/gpt-5.4-mini-fast";
        description = "Implementation subagent activated by spec to implement a specific delegated task. Reports STATUS (IN_PROGRESS / FAIL / COMPLETE) at each checkpoint. May create, edit, and delete files only within the delegated task scope.";
        permission = {
          task = {
            "*" = "deny";
          };
          bash = {
            "git log*" = "deny";
            "git show*" = "deny";
            "git blame*" = "deny";
            "jq *" = "allow";
            "git status" = "allow";
            "git status --short" = "allow";
            "git status --short *" = "allow";
            "git diff" = "allow";
            "git diff *" = "allow";
            ls = "allow";
            "ls -la" = "allow";
            "ls -1" = "allow";
            "ls -1 *" = "allow";
            "ls *" = "allow";
            "pnpm dev" = "allow";
            "pnpm build" = "allow";
            "pnpm start" = "allow";
            "pnpm check" = "allow";
            "pnpm format" = "allow";
            "pnpm typecheck" = "allow";
            "pnpm typecheck:go" = "allow";
            "pnpm test" = "allow";
            "pnpm test:run" = "allow";
            "pnpm build-storybook" = "allow";
            "pnpm verify" = "allow";
            "pnpm verify:frontend" = "allow";
            "pnpm verify:backend" = "allow";
          };
          edit = {
            "*" = "allow";
          };
          skill = {
            verify = "allow";
          };
        };
        prompt = readPrompt "execute";
        hidden = true;
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
      fast = {
        mode = "primary";
        model = "opencode-go/deepseek-v4-flash";
        description = "Primary agent for small, focused implementation tasks: function creation/modification, lint fixes, type error fixes, and minor refactors. Implements changes itself without delegating to execute.";
        permission = {
          task = {
            "*" = "deny";
            internet_search = "allow";
            explore = "allow";
            inspect = "allow";
          };
          edit = {
            "*" = "allow";
          };
          read = {
            "*" = "deny";
          };
          write = {
            "*" = "allow";
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
          bash = {
            "cat *" = "deny";
            "head *" = "deny";
            "tail *" = "deny";
            "sed *" = "deny";
            "awk *" = "deny";
            "grep *" = "deny";
            "rg *" = "deny";
            "find *" = "deny";
            ls = "deny";
            "ls *" = "deny";
            "git diff*" = "deny";
            "git log*" = "deny";
            "git show*" = "deny";
            "git blame*" = "deny";
          };
        };
        prompt = readPrompt "fast";
      };
      general = {
        mode = "subagent";
        hidden = true;
        disable = true;
      };
      idea = {
        mode = "primary";
        model = "opencode-go/deepseek-v4-flash";
        description = "Primary agent for collaborative ideation and specification design. Helps the user explore approaches and concretize ideas through dialogue. Does not create implementation plans. Uses internet_search when external knowledge is needed.";
        permission = {
          task = {
            "*" = "deny";
            internet_search = "allow";
            explore = "allow";
            inspect = "allow";
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
        prompt = readPrompt "idea";
        tools = {
          websearch = false;
          webfetch = false;
        };
      };
      inspect = {
        mode = "subagent";
        model = "openai/gpt-5.4-mini";
        description = "Git history inspection subagent. Activated by a primary agent when git history inspection (diff, log, show, status, blame) is needed. Read-only and git-only — no file access, no edits.";
        permission = {
          task = {
            "*" = "deny";
          };
          bash = {
            "*" = "deny";
            "git diff*" = "allow";
            "git log*" = "allow";
            "git show*" = "allow";
            "git status*" = "allow";
            "git blame*" = "allow";
          };
          edit = {
            "*" = "deny";
          };
          read = {
            "*" = "deny";
          };
        };
        prompt = readPrompt "inspect";
        tools = {
          question = false;
        };
      };
      internet_search = {
        mode = "subagent";
        model = "openai/gpt-5.4-mini";
        description = "Web research subagent. Activated by a primary agent when the latest library specifications, API documentation, or coding conventions cannot be answered from the local repository. Can only perform web searches — no file access or local operations.";
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
      plan = {
        mode = "subagent";
        hidden = true;
        disable = true;
      };
      plan_review = {
        mode = "subagent";
        model = "openai/gpt-5.4";
        description = "Plan review subagent activated by spec to rigorously review a draft implementation plan. May ask clarifying questions before issuing a verdict. Returns STATUS: REJECT (with required changes) or APPROVE (ends the review).";
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
        hidden = true;
        tools = {
          question = false;
          websearch = false;
          webfetch = false;
        };
      };
      review = {
        mode = "primary";
        model = "openai/gpt-5.4";
        description = "Primary agent for code review and idea review. Inspects changes via git diff and file exploration, then provides structured findings. Uses explore and deep_explore for investigation. Does not modify code.";
        permission = {
          task = {
            "*" = "deny";
            explore = "allow";
            deep_explore = "allow";
            inspect = "allow";
          };
          bash = {
            "*" = "deny";
            "git diff*" = "allow";
            "git log*" = "allow";
            "git show*" = "allow";
            "git status*" = "allow";
            "git blame*" = "allow";
            "ls*" = "allow";
            "find*" = "allow";
          };
          edit = {
            "*" = "deny";
          };
        };
        prompt = readPrompt "review";
      };
      spec = {
        mode = "primary";
        model = "opencode-go/deepseek-v4-pro";
        description = "Primary agent for implementation planning and execution. Clarifies requirements through dialogue, creates a draft plan reviewed by plan_review, gets user confirmation, then delegates tasks to execute in parallel.";
        permission = {
          task = {
            "*" = "deny";
            internet_search = "allow";
            explore = "allow";
            deep_explore = "allow";
            execute = "allow";
            inspect = "allow";
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
