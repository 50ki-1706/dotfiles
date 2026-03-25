#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG="$SCRIPT_DIR/opencode.json"
PROMPTS_DIR="$SCRIPT_DIR/prompts"
tmp="$(mktemp)"

if [[ ! -f "${CONFIG}" ]]; then
  echo "Config not found: ${CONFIG}" >&2
  exit 1
fi

if [[ ! -d "${PROMPTS_DIR}" ]]; then
  echo "Prompts directory not found: ${PROMPTS_DIR}" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required but not installed" >&2
  exit 1
fi

trap 'rm -f "${tmp}"' EXIT

# jq 引数とフィルタの組み立て
ARGS=()
FILTER='.'
updated=0

# Markdownファイルごとにプロンプトを抽出して jq 引数に追加
for f in "${PROMPTS_DIR}"/*.md; do
  [[ -f "$f" ]] || continue

  name=$(basename "$f" .md)

  if ! jq -e --arg name "$name" '.agent[$name] != null' "${CONFIG}" >/dev/null; then
    echo "Skip unknown agent markdown: ${f}" >&2
    continue
  fi
  
  # ## Prompt 以降を抽出し、先頭・末尾の空行を削除
  content=$(awk '
    BEGIN {in_prompt=0}
    /^## Prompt[[:space:]]*$/ {in_prompt=1; next}
    in_prompt {print}
  ' "$f")

  content=$(printf '%s\n' "$content" | sed '/./,$!d' | tac | sed '/./,$!d' | tac)

  if [[ -z "$content" ]]; then
    echo "Skip empty prompt body: ${f}" >&2
    continue
  fi
  
  ARGS+=(--arg "p_${name}" "$content")
  FILTER+=" | .agent[\"${name}\"].prompt = \$p_${name}"
  updated=$((updated + 1))
done

if [[ "$updated" -eq 0 ]]; then
  echo "No prompts were updated. Ensure markdown files contain a '## Prompt' section and match agent keys." >&2
  exit 1
fi

# jq を一回だけ実行して更新
jq "${ARGS[@]}" "$FILTER" "${CONFIG}" > "${tmp}"

mv "${tmp}" "${CONFIG}"
echo "Synced all prompts from ${PROMPTS_DIR} into ${CONFIG}"
