# スキルの管理

| 対象 | 配置先 | 反映 |
| --- | --- | --- |
| グローバル | `skills/<skill-name>/SKILL.md` | `~/.agents/skills` から参照。配置済みなら編集は即時反映 |
| リポジトリ固有 | `.agents/skills/<skill-name>/SKILL.md` | このリポジトリ内のみ（現在は `nix-verify`） |
| Home Manager 管理の OpenCode 用 | `~/.config/opencode/skills/git-surgeon/SKILL.md` | 固定した `git-surgeon` の公式ソースから配置 |
| Home Manager 管理の OpenCode 用 | `~/.config/opencode/skills/pr/` | 固定した上流ソースから本文・クレジット・ライセンスを配置 |

[スキル一覧](../../skills/README.md) を確認し、新規追加の前にモデルや既存のエージェント設定で代替できないか検討してください。追加時は目的と実行方針を最小限に記述します。リポジトリ固有スキルは `.gitignore` の例外として管理し、グローバルには配備しません。

リンクの作成・配置を変更した場合は、[設定の適用](../home-manager/README.md#設定の適用) が必要です。worktree からの参照先は [変更後の検証](../home-manager/README.md#変更後の検証) を確認してください。

`git-surgeon` はローカルの `skills/` には複製しません。Home Manager 管理外の環境では `git-surgeon install-skill --opencode` を使えます。管理された不変リンクにはインストーラーを実行しないでください。用途は [`/publish`](../opencode/publish.md) を参照してください。

`pr` は [記事](https://www.aihero.dev/skills-pr)で紹介された[上流ソース](https://github.com/mattpocock/skills/tree/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/pr)を固定します。固定 revision とハッシュの正本は [default.nix](../../modules/opencode/default.nix) です。更新時は上流の本文、スキルディレクトリの `CREDITS.md`、ルートの MIT `LICENSE` を同じ revision から取得し、ハッシュを更新して検証します。ローカルに複製せず、`~/.agents/skills` に配置しません。PR 本文ではリポジトリのテンプレートと入力制約が汎用スキルより優先されます。

## Playwright CLI の導入・更新

`playwright-cli` スキルは、CLI に同梱されたものを改変せず収録します。CLI と依存する `playwright`・`playwright-core` の固定バージョンは [packages/playwright-cli.nix](../../packages/playwright-cli.nix) を参照してください。スキルと CLI は同じ版を使います。Apache-2.0 の [LICENSE](../../skills/playwright-cli/LICENSE) を同梱しています。

[設定を適用](../home-manager/README.md#設定の適用) して CLI を導入した後、初回のみ次を実行します。

```sh
playwright-cli install-browser
```

ブラウザの保存先は `~/Library/Caches/ms-playwright` です。更新はスキルと CLI をセットで行います。

1. リポジトリ外の一時ディレクトリで `nix shell nixpkgs#nodejs_24 --command npx -y @playwright/cli@<新バージョン> install --skills=agents` を実行します。
2. 生成された `.agents/skills/playwright-cli/` を `skills/playwright-cli/` にコピーします。`LICENSE` と、上流にあれば `NOTICE` も残します。
3. `diff -r --exclude=LICENSE --exclude=NOTICE <一時ディレクトリ>/.agents/skills/playwright-cli skills/playwright-cli` でスキル本体の一致を確認します。
4. `packages/playwright-cli.nix` の `version` と3つの tarball URL を更新します。`playwright`・`playwright-core` の版は、選んだ `@playwright/cli` のレジストリメタデータの `dependencies` に合わせます。
5. `nix hash file <tarball>` などで3つの SRI ハッシュを更新し、検証して設定を適用します。
6. ブラウザのリビジョンが変わった場合は `playwright-cli install-browser` を再実行します。

`@latest` や CLI だけの更新は避けてください。CLI の整合チェックは実行ディレクトリ配下を対象とし、グローバル配置の `~/.agents/skills` は対象外です。

インストーラーは `--global` 付き、またはこのリポジトリ内で実行しないでください。前者はグローバルスキルのリンク先、後者は `.agents/skills/` と `.gitignore` に、意図しない変更や未追跡ファイルを残します。
