Analyze changes from this session and commit following Conventional Commits with appropriate granularity.

Steps:
1. Check `git status --short`, `git diff`, `git diff --cached`, and inspect untracked files to understand all changes
2. Judge changes attributable to this session from conversation history. Proceed without confirmation if clear from context. Only ask if attribution is ambiguous
3. Group changes into logical units at file or line level. Stop and confirm if mixed changes cannot be separated
4. Decide appropriate type (feat, fix, refactor, docs, chore, style, test, ci, perf, build) and scope for each group
5. Before staging, inspect the index with `git diff --cached`. If pre-staged changes exist that do not belong to the next logical commit, stop and ask the user to resolve them before continuing
6. For each logical unit, stage and commit:
   a. If the unit includes all unstaged changes in a file: `git add -- <file>`
   b. If the unit includes only part of the changes in a file:
      - Generate a unified diff patch that transforms the current index state into the intended staged state
      - Create a temporary file with `mktemp` outside the repository
      - Write the patch to the temporary file
      - Verify with `git apply --cached --check <patch>`
      - Apply with `git apply --cached <patch>`
      - Remove the temporary file (on both success and failure)
   c. Verify with `git diff --cached` that exactly the intended changes are staged
   d. Commit with the appropriate message
7. Repeat step 6 for remaining logical units

Prohibited:
- Blanket staging with `git add .` or `git add -A`
- `git reset --hard`, `git commit --amend`, `git push`
- Committing changes unrelated to this session
- Automatically unstaging or overwriting pre-staged changes

$ARGUMENTS
