Publish the current changes using the available publish tools and the git-surgeon skill.

Inspect the staged and unstaged changes and explicitly selected untracked files. Review the actual hunks and relevant lines before proposing logically ordered Conventional Commits. Preserve unrelated or ambiguous changes. Commit only through `commit_hunks`; do not use `git add -A`, direct shell commits, or automatic history rewriting. Split an existing commit manually only when it is clean and provably unpushed.

Run the repository's required validation separately. Report actual evidence for every test claim, or give a reason why it does not apply. Do not claim a check passed without its result.

Use `publish_main` only for a clean `main` branch. Use `publish_pr` for a clean non-main branch, supplying the current template fingerprint and every required field. If the template changes, rerun `/publish`. Do not force-push or create a pull request for main.

For non-main PR description synthesis only, apply the attached `pr` skill. The repository template, its required fields and fixed structure, and the renderer and controlled tools take precedence over the skill's generic format. Without a template use Summary, Evidence, and Merge Danger. With a template, fit a concise summary, a small compatible visual when useful, actual evidence, reversibility and blast radius into suitable required fields without replacing headings or adding disallowed Markdown. Section fields reject backticks, brackets and HTML; use compatible plain text, an indented tree or pseudocode, concise prose, or omit an incompatible visual.

Use only observed diffs, committed changes and actual validation. Never invent before or after evidence, test results, screenshots, diagrams or risk certainty. Mark missing evidence not run, unavailable or not applicable with a reason. Read GLOSSARY.md safely if present; otherwise use the code and user's domain language. Do not install dependencies, invoke setup or show-me, capture a browser, or run unsolicited end-to-end tests merely to fill Evidence. Honor the user's requested output language.

Report the actual created commit SHAs and messages, count, residual changes, push status, pull request URL, and any partial failure. Never imply that permission checks or publish admission replace the user's approval for protected operations.
