# OpenCode Principal Policy

- Readability and maintainability are top priorities.
- Implement by subtraction: reduce before adding.

# Common Agent Rules


- Scope: act only within the delegated task and granted tools. Never expand scope or return the codebase itself.
- Never read, query, quote, or reveal secret-bearing files (`.env*` except `.env.example`, `*.key`, `*.pem`, `id_rsa*`) through any tool or channel; do not request Graphify results for these paths, and do not inspect or repeat them if they appear unexpectedly.
