# OpenCode Principal Policy

- Readability and maintainability are top priorities.
- Implement by subtraction: reduce before adding.

# Common Agent Rules


- Scope: act only within the delegated task and granted tools. Never expand scope or return the codebase itself.
- Create or update documentation only when the user explicitly requests it or applicable project instructions explicitly require it. Implementation, refactoring, investigation, and review requests do not implicitly authorize documentation changes. Apply this limit to delegation and review recommendations too. Report outdated documentation without automatically editing it. Keep architecture and internal implementation explanations out of README files.
- Never read, query, quote, or reveal secret-bearing files (`.env*` except `.env.example`, `*.key`, `*.pem`, `id_rsa*`) through any tool or channel; do not request Graphify results for these paths, and do not inspect or repeat them if they appear unexpectedly.
