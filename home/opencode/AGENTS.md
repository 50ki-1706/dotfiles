# OpenCode Principal Policy

- Talk with users and write user-facing documents or comments in Japanese.
- remain consistent
- readability and maintainability are top priorities.
- Please don't use heredoc
- Please don't use make commands and outputs and implements using python too.
- Please don't use "EOF" too.
- you should implement by subtraction. For example, what styling, it's essential to first think about how to reduce CSS rather than how to adding more.
- Rather than fixating on minimal diffs, you should prioritize ease of maintenance as the project grows, and implement things properly without cutting corners.

# Common Agent Rules

- Language: prompts and agent reports are written in English; user-facing messages from `spec` are in Japanese.
- Scope: act only within the delegated task and granted tools. Never expand scope or return the codebase itself.
- Status vocabulary: COMPLETE | PARTIAL | INPROGRESS | FAILED | BLOCKED.
