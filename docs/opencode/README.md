# opencode 設定

このディレクトリには opencode の Nix 管理設定とエージェントプロンプトが含まれています。

## 方針

opencode 本体と設定は Home Manager の `programs.opencode` で管理します。
`home/opencode/opencode.nix` が設定の source of truth で、Home Manager が `~/.config/opencode/opencode.json` を生成します。

プロンプト本文は Markdown ファイルとして `home/opencode/prompts/*.md` に残し、`home/opencode/opencode.nix` から `builtins.readFile` で読み込みます。

## ファイル構成

```text
home/opencode/
├── opencode.nix          # opencode settings の source of truth
├── prompts/              # エージェントごとのプロンプトファイル（Markdown）
└── AGENTS.md             # エージェントの行動ポリシー定義
```

Home Manager 側では `home/default.nix` から次のように読み込みます。

```nix
programs.opencode = {
  enable = true;
  settings = import ./opencode/opencode.nix { };
};
```

## 編集ルール

- opencode の設定値、agent metadata、permission は `home/opencode/opencode.nix` を編集する。
- プロンプト本文は `home/opencode/prompts/*.md` を編集する。
- `opencode.json` は手で管理しない。Home Manager の switch/build で生成される。

## 反映

```sh
nix run home-manager -- switch --flake .#koki
```

## 補足: OpenCode の環境変数参照

`opencode.nix` で OpenCode の環境変数参照を書くときは、一般的な `${VAR}` ではなく OpenCode の `{env:VAR}` 構文を文字列として使う。

```nix
{
  options = {
    baseURL = "{env:SAKURA_BASE_URL}";
    apiKey = "{env:SAKURA_API_KEY}";
  };
}
```
