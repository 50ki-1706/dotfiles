# スキルの管理

| 対象 | 配置先 | 反映 |
| --- | --- | --- |
| グローバル | `skills/<skill-name>/SKILL.md` | `~/.agents/skills` から参照。配置済みなら編集は即時反映 |
| リポジトリ固有 | `.agents/skills/<skill-name>/SKILL.md` | このリポジトリ内のみ（現在は `nix-verify`） |

[スキル一覧](../../skills/README.md) を確認し、新規追加の前にモデルや既存のエージェント設定で代替できないか検討してください。追加時は目的と実行方針を最小限に記述します。リポジトリ固有スキルは `.gitignore` の例外として管理し、グローバルには配備しません。

リンクの作成・配置を変更した場合は、[設定の適用](../home-manager/README.md#設定の適用) が必要です。

## Playwright CLI の導入・更新

`playwright-cli` スキルは、`@playwright/cli@0.1.21` に同梱されたものを改変せず収録しています。CLI も同じ版を使い、`playwright`・`playwright-core` は `1.64.0-alpha-1789764292000` に固定します。ライセンスは Apache-2.0 で、`skills/playwright-cli/LICENSE` に同梱しています（上流に `NOTICE` はありません）。

[設定を適用](../home-manager/README.md#設定の適用) して CLI を導入した後、初回のみ次を実行します。

```sh
playwright-cli install-browser
```

ブラウザの保存先は `~/Library/Caches/ms-playwright` です。更新はスキルと CLI をセットで行います。

1. リポジトリ外の一時ディレクトリで `npx -y @playwright/cli@<新バージョン> install --skills=agents` を実行します。
2. 生成された `.agents/skills/playwright-cli/` を `skills/playwright-cli/` にコピーします。`LICENSE` と、上流にあれば `NOTICE` も残します。
3. `diff -r <一時ディレクトリ>/.agents/skills/playwright-cli skills/playwright-cli` で一致を確認します。
4. `packages/playwright-cli.nix` の `version` と3つの tarball URL を更新します。`playwright`・`playwright-core` の版は、選んだ `@playwright/cli` のレジストリメタデータの `dependencies` に合わせます。
5. `nix hash file <tarball>` などで3つの SRI ハッシュを更新し、検証して設定を適用します。
6. ブラウザのリビジョンが変わった場合は `playwright-cli install-browser` を再実行します。

`@latest` や CLI だけの更新は避けてください。CLI の整合チェックは実行ディレクトリ配下を対象とし、グローバル配置の `~/.agents/skills` は対象外です。

インストーラーは `--global` 付き、またはこのリポジトリ内で実行しないでください。前者はグローバルスキルのリンク先、後者は `.agents/skills/` と `.gitignore` に、意図しない変更や未追跡ファイルを残します。
