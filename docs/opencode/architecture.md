# /publish の設計

## Summary

`/publish` は現在のセッションのエージェントと既存の権限確認を保ち、変更の計画から PR までを段階的に進めます。Git・外部サービス・モデル出力をそれぞれ別の信頼境界として扱います。

## Details

OpenCode の command transform が指示と固定された公式スキルを添付し、出所を検証してからセッションを受理します。専用ツールは受理済みセッションに限定します。状態は受理、計画、コミット、クリーンツリーの確認、push、PR の順に進みます。リポジトリ単位の mutex が同時操作を防ぎます。

非 main は固定版 `git-surgeon` と `pr` の登録、パス、本文、権限を確認して両方を添付します。main は `git-surgeon` のみを読み込みます。これは出所と配信の境界であり、モデルの意味的な遵守を保証しません。`pr` の固定元とライセンスは[スキルの管理](../skills/README.md)を参照してください。

代替 index でコミットを構築し、元の index と作業ツリーを照合することで、証明可能な独立部分のステージ状態を保ちます。未対応または競合する変更は拒否します。コミット後の失敗では履歴を自動で巻き戻さず、作成済み SHA と残存状態を報告して停止します。再試行では remote SHA と既存 PR を確認し、重複操作を避けます。

動的スキーマと PR テンプレートの fingerprint をスナップショットとして扱い、変化した計画は拒否して再実行を求めます。checkbox・table・fence を含む対応形式を扱い、任意の Markdown 意味論は fail closed です。意味的な分割やテスト結果の真偽は証明できません。

本文の構造と入力制約は `pr` の汎用書式よりテンプレートを優先します。未観測の証拠を作らず、入力形式に合わない図は省略します。

権限 assertion は既存の `ask` を尊重します。プラグインが起動する子プロセスには、組み込みシェルスキャナーが自動適用されません。プラグイン自身の権限 assertion と検証した argv により操作を限定しますが、サンドボックスではありません。権限確認も外部 Git サーバーやモデルの正しさを保証しません。公開履歴の書き換えや破壊的操作は対象外です。

ツール一覧の `read`・`edit` 指定は表示の制御であり、実行時の認可ではありません。変更ツールはリポジトリへの `edit` を別途確認し、コマンド、対象の読み取り、スキルの権限確認も維持します。Git のパス指定は文字どおりに扱い、glob や pathspec magic と解釈しません。push は `--no-follow-tags` で対象ブランチのみを送ります。

中断、制限時間超過、出力上限では専用プロセスグループを終了し、通常の Git 子プロセスやフックも停止します。グループから離脱したプロセスや、すでにリモートが受理した操作は取り消せません。プロセスグループには POSIX 環境が必要です。

承認後、push・PR 作成の直前にテンプレート、ブランチ、HEAD、クリーン状態を再確認しますが、確認からプロセス起動までは原子的ではありません。

実装検証は `node --test modules/opencode/plugins/publish/*.test.ts` と既存テストで行います。外部への実際の publish はテストしません。一次資料は OpenCode 2.1.4 の [command](https://github.com/anomalyco/opencode/blob/v2.1.4/packages/plugin/src/promise/command.ts)、[tool](https://github.com/anomalyco/opencode/blob/v2.1.4/packages/plugin/src/promise/tool.ts)、[permission](https://github.com/anomalyco/opencode/blob/v2.1.4/packages/plugin/src/promise/permission.ts)、[session prompt](https://github.com/anomalyco/opencode/blob/v2.1.4/packages/core/src/session/prompt.ts) と、固定された [git-surgeon ソース](https://github.com/raine/git-surgeon/tree/ecf6dc42172ba757cc03bce1800ba1db45779f46) です。
