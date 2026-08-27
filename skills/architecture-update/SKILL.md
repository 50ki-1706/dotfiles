---
name: architecture-update
description: This skill guides spec on how to keep `.agents/architecture.md` in sync by delegating targeted updates to executer based on diff context.
---

# Architecture Update

**When to use**: At session start, before planning the task.

## Flow

1. At the beginning of the session, load this skill.
2. Read `.agents/architecture-diff.md` to understand what changed since the last architecture update.
3. If the diff status is `STALE`, note the changed files and sections that may need updating.
4. If the diff status is `CURRENT` with no changes, skip the post-task update step.
5. Proceed with the main task (planning, execution, etc.).
6. After task completion, delegate to `executer` to update only the affected sections of `.agents/architecture.md`.

## Delegation prompt

When delegating to `executer`, include these instructions:
- Read `.agents/architecture-diff.md` for the list of changed files and `suggested_metadata_commit_hash`.
- Read only the sections of `.agents/architecture.md` that correspond to the changed files.
- Update only those sections based on the changes. Do NOT rewrite unchanged sections.
- If the diff file does not exist, check `git status --short` and `git log --oneline -5`.
- If `.agents/architecture.md` does not exist, create it from the template below.
- Set metadata: `commit-hash` = `suggested_metadata_commit_hash` from the diff or current `HEAD`, `date` = today in `YYYY-MM-DD` format.
- `.agents/architecture.md` is personal and untracked — never commit it.

## Template sections

When creating `.agents/architecture.md` from scratch, include:

- A metadata block delimited by `-----` at the top, containing `date` and `commit-hash`.
- `# Project overview`: the repository purpose in 1–3 short sentences.
- `# Tech stack / Libraries`: major technologies grouped by role.
- `# Directory structure`: important directories in a compact tree with short role notes.
- `# Features / Modules and their dependency relationships`: entries ordered from upstream to downstream.
