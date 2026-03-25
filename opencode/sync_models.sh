#!/usr/bin/env bash
# models.tsv の内容を opencode.json に同期する
#
# 使い方:
#   ./sync_models.sh           # 同期実行
#   ./sync_models.sh --dry-run  # 変更内容の確認のみ

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TSV_FILE="$SCRIPT_DIR/models.tsv"
JSON_FILE="$SCRIPT_DIR/opencode.json"

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

if ! command -v jq &>/dev/null; then
  echo "エラー: jq がインストールされていません。" >&2
  exit 1
fi

# TSV を読み込んで jq フィルタを組み立てる
TOP_LEVEL_KEYS="model small_model"
filter="."
changed=0

while IFS=$'\t' read -r agent model; do
  # コメント・空行スキップ
  [[ -z "$agent" || "$agent" == \#* ]] && continue

  agent="${agent// /}"
  model="${model// /}"

  # トップレベルキーかエージェントかで分岐
  if echo "$TOP_LEVEL_KEYS" | grep -qw "$agent"; then
    current=$(jq -r ".[\"$agent\"] // empty" "$JSON_FILE")
    if [[ "$current" != "$model" ]]; then
      echo "  $agent: \"$current\" → \"$model\""
      filter="${filter} | .[\"$agent\"] = \"$model\""
      ((changed++)) || true
    fi
  else
    # エージェントが存在するか確認
    exists=$(jq -r ".agent[\"$agent\"] // empty" "$JSON_FILE")
    if [[ -z "$exists" ]]; then
      echo "警告: エージェント \"$agent\" が opencode.json に存在しません。スキップ。"
      continue
    fi
    current=$(jq -r ".agent[\"$agent\"].model // empty" "$JSON_FILE")
    if [[ "$current" != "$model" ]]; then
      echo "  agent.$agent.model: \"$current\" → \"$model\""
      filter="${filter} | .agent[\"$agent\"].model = \"$model\""
      ((changed++)) || true
    fi
  fi
done < "$TSV_FILE"

if [[ $changed -eq 0 ]]; then
  echo "変更なし。opencode.json はすでに最新です。"
  exit 0
fi

if $DRY_RUN; then
  echo ""
  echo "--dry-run: ファイルへの書き込みはスキップしました。"
  exit 0
fi

tmp=$(mktemp)
jq "$filter" "$JSON_FILE" > "$tmp"
mv "$tmp" "$JSON_FILE"
echo ""
echo "opencode.json を更新しました ($changed 箇所)。"
