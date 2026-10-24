## Python comments

- A docstring is the first statement inside a module, class, or function, using `"""triple quotes""".
  Use a concise summary ending in a period; for multiple lines, separate the summary and details
  with a blank line. Do not repeat the signature or type annotations.
- Preserve the project's Google, NumPy, or reStructuredText style. Without an existing convention,
  use Google-style `Args:`, `Returns:` (or `Yields:`), and `Raises:` sections only when they add
  contract information. Indent entries by four spaces; describe parameters in declaration order.
- Describe units, mutation, resource lifetime, generator behavior, and exception conditions when
  relevant. Keep implementation rationale in nearby `#` comments, not API docstrings.
- Name tests `test_<condition>_<expected_result>` when consistent with the suite. Use `# Given:`,
  `# When:`, and `# Then:` only for non-obvious phases. Explain unusual fixtures where defined;
  do not give every test a docstring that repeats its name or assertions.

Example inside a function body; omit sections that add no information:

```python
"""Wait for acknowledgement without extending the caller's deadline.

Args:
    timeout_ms: Positive whole milliseconds; includes connection setup.

Raises:
    TimeoutError: No acknowledgement arrives before the deadline.
"""
```
