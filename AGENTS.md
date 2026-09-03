- home-managerをビルドするときはnix経由で行なってください。

```sh
nix run home-manager -- switch --flake .#koki
```
- コードベースは無駄がない実装を心がけて下さい。
- ディレクトリ構造は複雑にならないよう意識して下さい。
- 必ず将来性、拡張性を意識した実装計画を立てて下さい。
- nixコードベースを変更した場合は必ず`nix-verify`スキル（`.agents/skills/nix-verify/SKILL.md`）に従ってください。

- このリポジトリには、各ディレクトに`AGENTS.md`があり、そこにそのディレクトリの目的や構成、EDRタイムラインの記録方法が書いてあります。変更を加えるときは、必ずそのディレクトリの`AGENTS.md`を確認してから作業してください。

## AGENTS.md一覧

| 所在地 | 対象ディレクトリ | 参照する対象 | 内容 |
| --- | --- | --- | --- |
| `AGENTS.md` | リポジトリ全体 | `.dotfiles`を編集するエージェント | home-managerのビルド方法、シンプルな実装方針、nix変更時の検証方針、各ディレクトリの`AGENTS.md`確認ルールを定義しています。 |
| `home/AGENTS.md` | `home/` | `.dotfiles`を編集するエージェント | `home.nix`を入口に、git.nix、shell.nix、vscode.nixなどhome-managerの設定、関連docsの所在、EDRタイムラインの記録方法をまとめています。 |
| `home/dotfiles/` | `home/dotfiles/` | `.dotfiles`を編集するエージェント | home-managerから配置する生設定ファイルを管理します（git/ignore、vscode/、shell/aliases）。codex/config.tomlは未配置のスナップショットです。 |
| `hosts/AGENTS.md` | `hosts/` | `.dotfiles`を編集するエージェント | ホスト固有のhome-managerモジュールの管理方針、プラットフォーム別設定の分割方法、EDRタイムラインの記録方法を説明しています。 |
| `home/opencode/AGENTS.md` | `home/opencode/` | OpenCode agent | OpenCode向けの作業ポリシー、回答や文書の言語、保守性、実装時の制約を定義しています。 |
| `packages/AGENTS.md` | `packages/` | `.dotfiles`を編集するエージェント | home-managerで読み込むパッケージ定義と、`ssh-bootstrap.nix`によるSSHキー管理、EDRタイムラインの記録方法を説明しています。 |
| `scripts/AGENTS.md` | `scripts/` | `.dotfiles`を編集するエージェント | `install.sh`と`migrate-legacy-links.sh`などのセットアップスクリプト、およびEDRタイムラインの記録方法を説明しています。 |
| `skills/AGENTS.md` | `skills/` | `.dotfiles`を編集するエージェント | OpenCode/agentスキルの集約場所、`~/.agents/skills`へのデプロイ方法、EDRタイムラインの記録方法を説明しています。 |

## EDR timeline

20260825 09:23:06 +0900 - Nix dotfilesの構成を整理し、home-managerのモジュールと配置用生設定をhome/配下へ集約しました。旧シンボリックリンクの移行処理をinstall.shのswitch前に追加しました。
20260826 11:43:45 +0900 - Ponytailのエッセンス（必要性ラダー）をAGENTS.mdに統合し、全エージェントプロンプトからRole/Objectiveの冗長を解消しました。
20260826 13:41:26 +0900 - OpenCodeのAGENTS.mdを全エージェント共通ルールのみへ削減し、実装制約をexecute.mdへ、日本語ルールをspec.mdへ再配置しました。
20260827 15:58:29 +0900 - OpenCodeのプロンプトをRole、Process、Rulesの固定スキーマへ統一し、共通OutputFormatに全エージェント共通の検証条項を追加しました。
20260827 21:04:57 +0900 - OpenCodeの全エージェントプロンプトを日本語から英語へ変換し、日本語での返信・報告指示は英語本文内に保持しました。
20260828 12:07:35 +0900 - vite-plusをHomebrew/Brewfile管理からNix管理へ移行しました（flake.nixにコミュニティflake ryoppippi/nix-vite-plusをoverlay経由で追加、Brewfileからvite-plusを削除）。
20260829 23:24:57 +0900 - nix-verifyスキルの実配置（.agents/skills/）とドキュメント（skills/AGENTS.md、docs/USER_GUIDE.md）のズレを解消しました。skills/AGENTS.mdとUSER_GUIDEのスキル一覧を実態に合わせ、nix-verifyの所在を明記しました。
20260829 22:11:15 +0900 - OpenCodeのdeep_exploreエージェントにread/grep/glob/listとユーザー承認済みのexternal_directoryの許可を追加し、タイポしたarchtectureのedit許可2行を削除しました。mkPermissionのデフォルトdenyによるファイル読み取り不能を解消し、spec.mdのread-only記述と設定を一致させました。
20260829 23:10:46 +0900 - OpenCodeのdeep_exploreを純粋なread-onlyに統一しました。promptからGit historyの言及を削除し(bash拒否との不整合解消)、agents.nixで.agents/architecture.mdへのedit権限を廃止しました。architecture-diff-contextプラグインのarchitecture.md初期化ガイダンスをdeep_exploreからexecuter経由へ変更しました。
20260901 02:28:40 +0900 - plan_reviewにread/grep/glob/list/external_directoryとGraphify MCPの利用を許可し、spec→plan_reviewの委譲要求フォーマット（goal、計画全文、調査対象ファイル、required evidence、agent-specific content）をspec.mdとplan_review.mdに定義しました。エージェント権限の記述をspec.md、plan_review.md、USER_GUIDEと同期しました。
20260902 20:59:44 +0900 - architecture.md同期トリガーをspecからdeep_exploreへ移管し、spec→deep_explore→executerのネスト委譲（subagent_depth=2）を有効化しました。spec.md/deep_explore.mdを最小化し、architecture-updateスキルを廃止してプラグインのupdate_guidanceへ指示を集約しました。プラグインのstatus計算にプレースホルダ検出を追加しました。subagent_depthのキーは将来のOpenCodeアップグレード時に要再確認です。
20260902 21:34:57 +0900 - executerプロンプトを親エージェント非依存（関数型）にし、委譲元の変化に影響されない実行専用エージェントとして調整しました。
20260902 22:45:23 +0900 - OpenCodeのMCPサーバー接続を安定化しました。graphifyのuv runに不足していたgraphifyy[mcp]エクストラを追加し、chrome-devtools/playwrightをバージョン固定（1.8.0 / 0.0.80）とし、全サーバーにenvironment.PATHとtimeout=60000を設定しました。
20260903 02:09:16 +0900 - Node.jsをNix管理のhome.packages（pkgs.nodejs）に追加し、MCPサーバー起動のPATHからvite-plus由来のnode/npx依存を解消しました。
20260902 22:12:15 +0900 - OpenCodeの全サブエージェントプロンプトとagents.nixのdescriptionから親エージェント（spec）への依存記述を除去し、execute.mdと同様の純粋関数型プロンプトに統一しました。規約をdocs/USER_GUIDE.mdに記録しました。
20260903 00:12:47 +0900 - OpenCodeの各エージェントプロンプトの重複（Role・Process・Rules間の反復）を整理し、制約を保持したままコンテキストを圧縮しました。plan_review.mdとoutput-format.mdは重複がないため無変更です。
