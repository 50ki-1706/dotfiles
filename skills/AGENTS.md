# skillsディレクトリについて

## 目的

OpenCodeおよび各agentが利用するグローバルスキルを、リポジトリ直下に集約して管理します。Home Managerは`~/.agents/skills`を`mkOutOfStoreSymlink`でこのディレクトリへリンクするため、リポジトリ内の編集がグローバルスキルへ即時反映されます。

## 構成

- `skills/<skill-name>/SKILL.md`: 各スキルの定義と実行方針
- OpenCode由来の`gh-cli`
- 既存のグローバルスキルから統合した`computer-use`、`orca-cli`、`orchestration`
- リポジトリ固有スキル（`nix-verify`、`minimal-repository`）は`.agents/skills/`配下に配置し、グローバル配備（`~/.agents/skills`へのリンク）の対象外とします。`.gitignore`の例外設定でバージョン管理します。
