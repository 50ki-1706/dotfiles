## Rust comments

- Use `///` immediately before the documented item, and `//!` for the enclosing module or crate.
  Start with a short contract summary; separate paragraphs with a bare doc-comment line. Use
  Markdown and intra-doc links such as [`Type`] rather than restating signature types.
- Document public contracts. Include `# Errors` for relevant `Result::Err` conditions, `# Panics`
  for reachable panic conditions, and `# Safety` for caller obligations of unsafe APIs. Explain
  ownership, borrowing, or lifetimes only when the signature does not make the contract clear.
  Never invent empty sections to satisfy a template.
- Useful `# Examples` should be runnable doctests with necessary imports. Hide setup with `# `
  inside a Rust code fence only when needed for compilation; do not use `ignore` to conceal a
  broken example. Use `no_run` for compilable examples that must not execute, and `compile_fail`
  only for deliberate compile-time failures.
- Use ordinary `//` comments for implementation and test rationale. Place `// SAFETY: <why the
  preconditions hold>` immediately before unsafe operations when the justification is not evident.
  Name tests for conditions and outcomes; add phase comments only for non-obvious scenarios.

Example immediately before a function returning `Result`:

```rust
/// Keeps the caller's deadline when retrying an interrupted read.
///
/// # Errors
/// Returns `ReadError::Timeout` when no complete frame arrives before the deadline.
```
