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
20260901 02:28:40 +0900 - plan_reviewにread/grep/glob/list/external_directoryとGraphify MCPの利用を許可し、spec→plan_reviewの委譲要求フォーマット（goal、計画全文、調査対象ファイル、required evidence、agent-specific content）をspec.mdとplan_review.mdに定義しました。エージェント権限の記述をspec.md、plan_review.md、USER_GUIDEと同期しました。
20260902 20:59:44 +0900 - architecture.md同期トリガーをspecからdeep_exploreへ移管し、spec→deep_explore→executerのネスト委譲（subagent_depth=2）を有効化しました。spec.md/deep_explore.mdを最小化し、architecture-updateスキルを廃止してプラグインのupdate_guidanceへ指示を集約しました。プラグインのstatus計算にプレースホルダ検出を追加しました。subagent_depthのキーは将来のOpenCodeアップグレード時に要再確認です。
20260902 21:34:57 +0900 - executerプロンプトを親エージェント非依存（関数型）にし、委譲元の変化に影響されない実行専用エージェントとして調整しました。
20260903 20:38:15 +0900 - find-skills、owasp-top10、owasp-llm-top10をskills/から削除し、skillAllowプリセットにcomputer-use、orca-cli、orchestrationを追加。specをプリセットへ統一し、spec/executerでgh-cliとOrca 3スキルの許可リストを共有しました。
