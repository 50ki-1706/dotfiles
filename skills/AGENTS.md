# skillsディレクトリについて

## 目的

OpenCodeおよび各agentが利用するグローバルスキルを、リポジトリ直下に集約して管理します。Home Managerは`~/.agents/skills`を`mkOutOfStoreSymlink`でこのディレクトリへリンクするため、リポジトリ内の編集がグローバルスキルへ即時反映されます。

## 構成

- `skills/<skill-name>/SKILL.md`: 各スキルの定義と実行方針
- OpenCode由来の`gh-cli`、`owasp-top10`、`owasp-llm-top10`
- 既存のグローバルスキルから統合した`computer-use`、`find-skills`、`orca-cli`、`orchestration`
- リポジトリ固有スキル（`nix-verify`、`minimal-repository`）は`.agents/skills/`配下に配置し、グローバル配備（`~/.agents/skills`へのリンク）の対象外とします。`.gitignore`の例外設定でバージョン管理します。

## EDR timeline

以下のフォーマットで、skillsディレクトリ内の変更を記録してください。変更の内容がわかるように、簡潔な説明をつけてください。

20260824 19:10:00 +0900 - OpenCodeスキルと`nix-verify`を`home/opencode`および`.agents/skills`から`skills/`へ移動し、既存のグローバルスキル（computer-use、find-skills、orca-cli、orchestration）を統合しました。`~/.agents/skills`はmkOutOfStoreSymlinkで`skills/`を参照します。
20260826 15:10:42 +0900 - `architecture-update`スキルを追加し、タスク完了後に`executer`が`architecture.md`を更新する委譲フローを定義しました。
20260827 14:18:10 +0900 - `minimal-repository`スキルを追加し、リポジトリの最小サイズを保つ判断基準を定義しました。
20260827 14:22:35 +0900 - minimal-repositoryスキルをskills/から.agents/skills/へ移動し、リポジトリ固有のスキルとしました。
20260827 14:53:15 +0900 - `architecture-update`スキルをセッション開始時の差分確認と対象セクション限定更新の委譲フローへ更新しました。
20260829 23:24:57 +0900 - ドキュメントを実態に合わせました。nix-verifyは現在リポジトリ固有スキルとして.agents/skills/に配置されているため、構成から削除し、リポジトリ固有スキルの配置方針を追記しました。
