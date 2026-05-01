#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CSV_FILE="${SCRIPT_DIR}/../settings/models.csv"
JSON_FILE="${SCRIPT_DIR}/../../opencode/opencode.json"

if [[ ! -f "$CSV_FILE" ]]; then
  echo "Error: $CSV_FILE not found" >&2
  exit 1
fi

if [[ ! -f "$JSON_FILE" ]]; then
  echo "Error: $JSON_FILE not found" >&2
  exit 1
fi

jq_filter="."

while IFS=',' read -r agent_name model; do
  # Skip empty lines and comment lines
  [[ -z "${agent_name:-}" || "$agent_name" =~ ^[[:space:]]*# ]] && continue

  # Trim whitespace
  agent_name=$(echo "$agent_name" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  model=$(echo "$model" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

  if [[ "$agent_name" == "model" || "$agent_name" == "small_model" ]]; then
    jq_filter="$jq_filter | .${agent_name} = \"$model\""
  else
    jq_filter="$jq_filter | .agent.${agent_name}.model = \"$model\""
  fi
done < "$CSV_FILE"

jq "$jq_filter" "$JSON_FILE" > "${JSON_FILE}.tmp" && mv "${JSON_FILE}.tmp" "$JSON_FILE"

echo "Updated models from $CSV_FILE"
