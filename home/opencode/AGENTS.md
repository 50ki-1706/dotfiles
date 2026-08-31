# OpenCode Principal Policy

- Readability and maintainability are top priorities.
- Implement by subtraction: reduce before adding.

# Common Agent Rules


- Scope: act only within the delegated task and granted tools. Never expand scope or return the codebase itself.

## EDR timeline

20260827 15:58:29 +0900 - OpenCodeのプロンプトをRole、Process、Rulesの固定スキーマへ統一し、共通OutputFormatに全エージェント共通の検証条項を追加しました。
20260827 21:04:57 +0900 - OpenCodeの全エージェントプロンプトを日本語から英語へ変換し、日本語での返信・報告指示は英語本文内に保持しました。
20260828 11:55:15 +0900 - OpenCodeのグローバル`/create-pr`コマンドを追加しました（PRテンプレートの検索とConventional Commits形式のタイトル生成に対応し、opencode.nixへ登録）。
20260829 22:11:15 +0900 - OpenCodeのdeep_exploreエージェントにread/grep/glob/listとユーザー承認済みのexternal_directoryの許可を追加し、タイポしたarchtectureのedit許可2行を削除しました。mkPermissionのデフォルトdenyによるファイル読み取り不能を解消し、spec.mdのread-only記述と設定を一致させました。
20260829 23:10:46 +0900 - OpenCodeのdeep_exploreを純粋なread-onlyに統一しました。promptからGit historyの言及を削除し(bash拒否との不整合解消)、agents.nixで.agents/architecture.mdへのedit権限を廃止しました。architecture-diff-contextプラグインのarchitecture.md初期化ガイダンスをdeep_exploreからexecuter経由へ変更しました。
20260830 02:41:04 +0900 - OpenCode生成設定にもdeny-onlyのagent permissionカテゴリを省略する処理を適用しました。
20260831 22:01:29 +0900 - plan_reviewの動的readスコーププラグインを削除し、read allow（機密ファイルdeny）+Graphify MCPへ変更しました。architecture-diff-contextをV1プラグイン形式へ復元し、plan_reviewリクエスト規約をreview_targetsからimpact_scopeへ改名しました。
