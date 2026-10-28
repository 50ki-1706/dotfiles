## Comments and documentation

Apply these rules when writing, delegating, or reviewing comments, docstrings, and documentation.
Follow the project's language, documentation tools, and established conventions. Language-specific
formats are supplied separately when detected; use them only for matching source files. Do not add
boilerplate comments to every function or test.

- Prefer clear names and simple code. Do not repeat what the code already makes clear in comments,
  docstrings, or docs. Explain non-obvious reasons, constraints, or hazards; clarify tricky code before
  adding an explanation. Retain type annotations needed by documentation or type-checking tools.
- README files introduce what a project or tool does, who it is for, and how to start using it. Do not
  turn them into change logs or descriptions of internal implementation, prompts, or workflow mechanics.
  New READMEs use an optional document title followed by exactly three `##` sections:
  `What this is / isn’t`, `Features`, and `Setup`, in that order. Do not add sections or subheadings.
  Preserve an existing README's headings and structure even when they differ; update within them
  without adding or normalizing sections. Move detailed explanations to docs and link to them.
- Put necessary design and implementation context in `docs/`, such as rationale, trade-offs, and
  constraints that cannot be recovered from the code. Do not duplicate code walkthroughs there either.
  Group docs into directories by subject or reader purpose, not mechanical source-tree mirroring.
  Split files by independently useful subjects, not arbitrary fragments. Non-README docs use an
  optional document title followed by exactly two `##` sections: `Summary` and `Details`; do not add
  sections or subheadings. README rules take precedence for README files under `docs/`.
  Do not bulk-reorganize existing docs merely to enforce this format.
- User docs lead with purpose and usage. Include prerequisites, a minimal example, expected results,
  and cautions when relevant to the reader's task, within the allowed headings.
- Before editing documentation, read applicable project instructions and the existing README/docs
  layout. Update affected docs when the behavior, usage, configuration, or prerequisites they describe
  change. Maintain relevant indexes and relative links when adding, moving, or deleting docs. Keep a
  clear source of truth and link to it instead of duplicating information.
- Keep Japanese and English concise and information-rich. Use concrete, consistent terms and short
  sentences with one point each. Remove repetition and filler; follow local conventions, use natural
  Japanese without needless subjects or modifiers, and write direct, active English.
- Preserve correctness, safety, API contracts, required architecture records, and verification evidence.
  Avoid arbitrary word or line limits.

### Functions and implementation comments

- Put function/API documentation at the language's required location using its native doc-comment
  format. Describe the caller's contract: units, valid ranges, ownership, side effects, error conditions,
  or async behavior when these are not evident from the signature. Omit summaries that only restate
  the function name.
- Inside a function, use a short line comment immediately before the relevant code to explain a
  non-obvious reason or invariant. For longer explanations, use the language's ordinary comments,
  not extra docstrings. Keep API contracts together in their native documentation location.

### Tests and temporary notes

- Name tests with the condition and observable expected result, following the local test framework's
  style. Explain the scenario in the name before adding comments; do not restate assertions in prose
  or add JSDoc to ordinary test callbacks.
- For a complex scenario, use `// Given: <non-obvious setup or constraint>`,
  `// When: <trigger>`, and `// Then: <observable outcome>` before the relevant phase, or the language's
  equivalent line-comment syntax. Omit labels that merely narrate obvious setup, calls, or assertions;
  blank lines are enough for simple tests. Follow an existing Arrange/Act/Assert convention instead
  when the project uses it.
- Explain unusual fixtures, mock behavior, timing, or tolerances where they appear. For regression
  tests, record the original failure condition and an issue link only when the test name and assertions
  cannot preserve that context. Document reusable test helpers like other functions when necessary.
- Do not keep disabled code or tests as commented-out blocks; Git preserves removed code. Use the test
  framework's skip mechanism only when justified, with a reason and a re-enable condition or issue.
  Format actionable temporary notes as `TODO(issue-or-topic): <remaining work and completion condition>`;
  do not leave unexplained TODO/FIXME markers.
