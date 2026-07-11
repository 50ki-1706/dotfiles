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

## architecture差分更新フックについて
`architecture-diff-context.js` は OpenCode plugin として読み込まれ、session作成時とidle時に `.agents/architecture-diff.md` を生成する。
このファイルは `.agents/architecture.md` の `opencode-architecture-head` マーカー、または最後に `.agents/architecture.md` を変更したcommitを基準に、現在のHEADまでの変更ファイルと未commit差分をまとめる。
deep_exploreはこの生成ファイルを読んで、変更ファイルを優先的に確認してから `.agents/architecture.md` を更新する。
