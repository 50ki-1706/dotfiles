Analyze changes from this session and commit following Conventional Commits with appropriate granularity.

Steps:
1. Check `git status --short`, `git diff`, `git diff --cached` to understand all changes
2. Judge changes attributable to this session from conversation history. Proceed without confirmation if clear from context. Only ask if attribution is ambiguous
3. Group changes into logical units. Stop and confirm if mixed changes cannot be separated
4. Decide appropriate type (feat, fix, refactor, docs, chore, style, test, ci, perf, build) and scope for each group
5. Stage only necessary files with `git add` per commit, verify with `git diff --cached` before committing
6. Write concise commit messages in English

Prohibited:
- Blanket staging with `git add .` or `git add -A`
- `git reset --hard`, `git commit --amend`, `git push`
- Committing changes unrelated to this session

$ARGUMENTS
