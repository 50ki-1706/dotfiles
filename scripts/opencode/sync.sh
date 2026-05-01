#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OPENCODE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)/opencode"
CONFIG_DIR="$OPENCODE_DIR/config"
AGENTS_DIR="$OPENCODE_DIR/agents"
OUTPUT="$OPENCODE_DIR/opencode.json"
TMP="$OPENCODE_DIR/opencode.json.tmp"
BACKUP="$OPENCODE_DIR/opencode.json.bak"

CONFIG_ORDER=(base watcher mcp permission)

echo "Validating config files..."
KEYS_SEEN=""
for name in "${CONFIG_ORDER[@]}"; do
  file="$CONFIG_DIR/$name.json"
  if [ ! -f "$file" ]; then
    echo "Error: missing config file: $file" >&2
    exit 1
  fi
  keys=$(jq -r 'keys[]' "$file")
  for key in $keys; do
    if echo "$KEYS_SEEN" | grep -qw "$key"; then
      echo "Error: duplicate top-level key '$key' in config file '$name.json'" >&2
      exit 1
    fi
    KEYS_SEEN="$KEYS_SEEN $key"
  done
done

echo "Validating agent files..."
if [ ! -d "$AGENTS_DIR" ]; then
  echo "Error: agents directory not found: $AGENTS_DIR" >&2
  exit 1
fi

AGENT_KEYS_SEEN=""
for agent_file in "$AGENTS_DIR"/*.json; do
  [ -f "$agent_file" ] || continue
  basename=$(basename "$agent_file" .json)
  key_count=$(jq 'length' "$agent_file")
  if [ "$key_count" -ne 1 ]; then
    echo "Error: $agent_file must contain exactly 1 top-level key, found $key_count" >&2
    exit 1
  fi
  actual_key=$(jq -r 'keys[0]' "$agent_file")
  if [ "$actual_key" != "$basename" ]; then
    echo "Error: $agent_file has key '$actual_key' but filename expects '$basename'" >&2
    exit 1
  fi
  if echo "$AGENT_KEYS_SEEN" | grep -qw "$actual_key"; then
    echo "Error: duplicate agent key '$actual_key' from $agent_file" >&2
    exit 1
  fi
  AGENT_KEYS_SEEN="$AGENT_KEYS_SEEN $actual_key"
done

# Backup existing output
if [ -f "$OUTPUT" ]; then
  cp "$OUTPUT" "$BACKUP"
fi

# Merge config files in order
CONFIG_ARGS=()
for name in "${CONFIG_ORDER[@]}"; do
  CONFIG_ARGS+=("$CONFIG_DIR/$name.json")
done

echo "Merging config files..."
MERGED_CONFIG=$(jq -s 'reduce .[] as $item ({}; . * $item)' "${CONFIG_ARGS[@]}")

# Merge agent files
echo "Merging agent files..."
MERGED_AGENTS=$(jq -s 'reduce .[] as $item ({}; . * $item)' "$AGENTS_DIR"/*.json)

# Combine config + agents
echo "Generating $OUTPUT..."
echo "$MERGED_CONFIG" | jq --argjson agents "$MERGED_AGENTS" '. + {agent: $agents}' > "$TMP"

# Validate output
if ! jq -e . "$TMP" > /dev/null 2>&1; then
  echo "Error: generated output is not valid JSON" >&2
  rm -f "$TMP"
  if [ -f "$BACKUP" ]; then
    mv "$BACKUP" "$OUTPUT"
  fi
  exit 1
fi

# Atomic move
mv "$TMP" "$OUTPUT"

# Clean up backup on success
rm -f "$BACKUP"

echo "Generated $OUTPUT successfully"
