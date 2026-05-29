## OpenCode CLIの環境変数参照について
`opencode.nix` で OpenCode の環境変数参照を書くときは、一般的な `${VAR}` ではなく OpenCode の `{env:VAR}` 構文を文字列として使う。

```nix
{
  options = {
    baseURL = "{env:SAKURA_BASE_URL}";
    apiKey = "{env:SAKURA_API_KEY}";
  };
}
```
