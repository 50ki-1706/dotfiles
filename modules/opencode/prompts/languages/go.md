## Go comments

- Use `//` doc comments directly before declarations, without an intervening blank line. Document
  exported API contracts. Start a symbol's summary with its name, and package documentation with
  `Package <name>`; keep package documentation in one file. Separate paragraphs with a bare `//`.
- Explain error conditions, meaningful zero values, ownership, cancellation, and concurrency safety
  where relevant. Use prose, not JSDoc tags or parameter/type lists that duplicate the signature.
  Use `[Symbol]` links when helpful and preserve formatting with `gofmt`.
- Name tests `Test<Behavior>` and give table cases meaningful condition/outcome names through
  `t.Run`. Explain only unusual fixtures, synchronization, and regression constraints; ordinary
  assertion statements do not need narration.
- Runnable documentation examples belong in `Example` or `Example<Symbol>` functions in `_test.go`
  files. Add accurate `// Output:` or `// Unordered output:` text when output is deterministic and
  the example should be checked by `go test`; these comments are executable test expectations.

Example immediately before an exported function:

```go
// ReadFrame leaves r positioned at the next frame boundary on success.
// It returns io.ErrUnexpectedEOF when the final frame is incomplete.
```
