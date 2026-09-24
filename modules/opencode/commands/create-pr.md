Create a GitHub pull request for the current session's changes with `gh`, using a Conventional Commits title.

Steps:
1. Preconditions:
   a. Resolve the repository root with `git rev-parse --show-toplevel` and work from that directory for all subsequent commands. Stop if it fails
   b. Run `git status --short`. If the output contains any staged, unstaged, or untracked changes, stop and instruct the user to run `/commit` first. This command never stages or commits
   c. Get the current branch with `git branch --show-current`. Stop if the result is empty because the repository is in a detached HEAD state
2. Base branch:
   a. Confirm that an `origin` remote exists, then get the repository default branch with `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`. Stop if there is no `origin` remote or this command fails
   b. If the current branch equals the default branch, stop and warn that a pull request cannot be created from the default branch
   c. Verify that `origin/<default-branch>` exists with `git rev-parse --verify "origin/<default-branch>"`. If it is missing, run `git fetch origin "<default-branch>"` without force. Stop if the fetch fails
   d. Run `git log origin/<default-branch>..HEAD --oneline`. If it is empty, stop and report that there are no commits ahead of the base
3. Title (Conventional Commits):
   - Derive the type, optional scope, and summary from this session's changes, the commit subjects in `origin/<default-branch>..HEAD`, and `git diff --stat origin/<default-branch>..HEAD`
   - Format the title as `type(scope): summary`; the scope is optional. Use only one of these types: `feat`, `fix`, `refactor`, `docs`, `chore`, `style`, `test`, `ci`, `perf`, or `build`
4. Body:
   - From the repository root only, look up a pull request template using this precedence order; the first existing exact path wins: `pr_template.md`, `PULL_REQUEST_TEMPLATE.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/pull_request_template.md`. Use a plain existence check for these paths only; do not search recursively or case-insensitively
   - If a template is found, use it as the body skeleton. Preserve its headings and checklists, fill its placeholders with content derived from the session changes, commits, and diff, and remove all template HTML comments
   - If no template is found, use this default format:
     ```markdown
     ## Summary
     <1–3 sentence overview>

     ## Changes
     - <key change>

     ## Validation
     - <how the change was verified>
     ```
5. Duplicate check: run `gh pr list --head "<branch>" --state open --json number,url`. If an open pull request already exists for this branch, report its URL and stop
6. Push: run `git push -u origin "<branch>"`. Stop immediately if it fails. Never use a force option
7. Create the pull request:
   - Interpret `$ARGUMENTS` as user intent only. The only recognized option is `draft`, case-insensitive; when present, add `--draft`. For any other unrecognized argument, ask the user for clarification instead of forwarding it
   - Create a temporary file outside the repository with `mktemp`. Write the generated body to that file without interpolating its contents into a shell command string. Arrange cleanup with traps so the file is removed on success, failure, and interruption
   - Never interpolate `$ARGUMENTS`, the title, or file contents directly into shell command strings. Pass values as safely quoted arguments or via files
   - Run `gh pr create --base "<default-branch>" --head "<branch>" --title "<title>" --body-file "<tmpfile>"`, adding `--draft` only when requested. Quote every value
   - Stop immediately on any failure. On success, report the pull request URL

Prohibited:
- Staging or committing changes (that is `/commit`'s role)
- `git push --force` or `git push --force-with-lease`
- Creating a pull request from the default branch
- Modifying or deleting the discovered pull request template file
- Injecting `$ARGUMENTS` or file contents into shell command strings

$ARGUMENTS
