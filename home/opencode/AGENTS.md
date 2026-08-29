# OpenCode Principal Policy

- Readability and maintainability are top priorities.
- Implement by subtraction: reduce before adding.

# Common Agent Rules


- Scope: act only within the delegated task and granted tools. Never expand scope or return the codebase itself.

## EDR timeline

20260827 15:58:29 +0900 - OpenCodeのプロンプトをRole、Process、Rulesの固定スキーマへ統一し、共通OutputFormatに全エージェント共通の検証条項を追加しました。
20260827 21:04:57 +0900 - OpenCodeの全エージェントプロンプトを日本語から英語へ変換し、日本語での返信・報告指示は英語本文内に保持しました。
20260828 11:45:47 +0900 - Worktrunk公式OpenCodeプラグインを導入し、home-managerでグローバル配置する設定を追加しました。
20260828 11:55:15 +0900 - OpenCodeのグローバル`/create-pr`コマンドを追加しました（PRテンプレートの検索とConventional Commits形式のタイトル生成に対応し、opencode.nixへ登録）。
