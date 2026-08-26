---
name: architecture-update
description: This skill guides spec on how to delegate `.agents/architecture.md` updates to executer after every task completion.
---

# Architecture Update

**When to use**: After every task completion, before reporting the final result to the user.

## Delegation flow

1. After the implementation task is complete, delegate to `executer` with instructions to update `.agents/architecture.md`.
2. Include the following instructions in the delegation prompt:
   - Read `.agents/architecture-diff.md` if present for changed files and `suggested_metadata_commit_hash`.
   - If the diff file does not exist, check `git status --short` and `git log --oneline -5` to identify recent changes.
   - If `.agents/architecture.md` does not exist, create it from the template below.
   - Update the file with real project information based on the changes.
   - Set metadata: `commit-hash` = `suggested_metadata_commit_hash` from the diff or the current `HEAD`, and `date` = today in `YYYY-MM-DD` format.
3. `.agents/architecture.md` is personal and untracked — never commit it.

## Template sections

When creating `.agents/architecture.md` from scratch, include:

- A metadata block delimited by `-----` at the top, containing `date` and `commit-hash`.
- `# Project overview`: the repository purpose in 1–3 short sentences.
- `# Tech stack / Libraries`: major technologies grouped by role.
- `# Directory structure`: important directories in a compact tree with short role notes.
- `# Features / Modules and their dependency relationships`: entries ordered from upstream to downstream.
