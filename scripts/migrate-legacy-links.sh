#!/usr/bin/env zsh

setopt ksharrays
set -euo pipefail

SCRIPT_PATH="${(%):-%N}"
REPO_ROOT="$(cd "$(dirname "${SCRIPT_PATH:A}")/.." && pwd)"

absolutize_dir() {
  local base="$1"

  case "$base" in
    /*) printf '%s\n' "$base" ;;
    *) printf '%s/%s\n' "$PWD" "$base" ;;
  esac
}

normalize_path() {
  local dest="$1"
  local base="$2"
  local path
  local segment
  local popped
  local -i n=0
  local -i i=0
  local -a out=()

  if ! base="$(absolutize_dir "$base")"; then
    return 1
  fi

  case "$dest" in
    /*) path="$dest" ;;
    *) path="${base%/}/$dest" ;;
  esac

  while :; do
    if [[ "$path" == */* ]]; then
      segment="${path%%/*}"
      path="${path#*/}"
    else
      segment="$path"
      path=""
    fi

    case "$segment" in
      '' | .)
        ;;
      ..)
        if (( n == 0 )); then
          printf '安全でないパス: 親ディレクトリ移動が絶対パスのルートを越えます。\n' >&2
          return 1
        fi

        popped=""
        i=0
        while (( i < n )); do
          popped="${popped}/${out[i]}"
          i=$((i + 1))
        done
        [[ -n "$popped" ]] || popped="/"

        if [[ -L "$popped" ]] || [[ ! -d "$popped" ]]; then
          printf '安全でないパス: 親ディレクトリ移動がディレクトリでない要素またはシンボリックリンクを越えます: %s\n' "$popped" >&2
          return 1
        fi
        n=$((n - 1))
        ;;
      *)
        out[n]="$segment"
        n=$((n + 1))
        ;;
    esac

    [[ -n "$path" ]] || break
  done

  path=""
  i=0
  while (( i < n )); do
    path="${path}/${out[i]}"
    i=$((i + 1))
  done
  [[ -n "$path" ]] || path="/"
  printf '%s\n' "$path"
}

resolve_chain() {
  local link="$1"
  local dest
  local -i depth=0
  local -i i=0
  local -a visited=()

  while [[ -L "$link" ]]; do
    if ! dest="$(readlink "$link")"; then
      printf '安全でないシンボリックリンク連鎖: %s のreadlinkに失敗しました。\n' "$link" >&2
      return 1
    fi
    if ! dest="$(normalize_path "$dest" "$(dirname "$link")")"; then
      printf '安全でないシンボリックリンク連鎖: %s を正規化できません。\n' "$link" >&2
      return 1
    fi

    i=0
    while (( i < ${#visited[@]} )); do
      if [[ "${visited[i]}" == "$dest" ]]; then
        printf '安全でないシンボリックリンク連鎖: %s で循環を検出しました。\n' "$dest" >&2
        return 1
      fi
      i=$((i + 1))
    done
    visited[${#visited[@]}]="$dest"

    link="$dest"
    depth=$((depth + 1))
    if (( depth > 50 )); then
      printf '%s\n' '安全でないシンボリックリンク連鎖: 深さが50を超えました。' >&2
      return 1
    fi
  done

  printf '%s\n' "$link"
}

MAPPINGS=(
  "$HOME/.config/git/ignore"
  "$REPO_ROOT/git/ignore"
  "$REPO_ROOT/home/dotfiles/git/ignore"
  "$HOME/Library/Application Support/Code/User/settings.json"
  "$REPO_ROOT/config/Code/User/settings.json"
  "$REPO_ROOT/home/dotfiles/vscode/settings.json"
  "$HOME/Library/Application Support/Code/User/keybindings.json"
  "$REPO_ROOT/config/Code/User/keybindings.json"
  "$REPO_ROOT/home/dotfiles/vscode/keybindings.json"
)

main() {
  local target
  local legacy
  local new
  local final
  local diagnostic
  local -i i=0
  local -i offset=0
  local -i mapping_count=$(( ${#MAPPINGS[@]} / 3 ))
  local -i abort=0
  local -i removed=0
  local -a states=()
  local -a diagnostics=()

  printf '%s\n' '== 旧シンボリックリンクの移行事前確認 =='

  while (( i < mapping_count )); do
    offset=$((i * 3))
    target="${MAPPINGS[offset]}"
    legacy="${MAPPINGS[offset + 1]}"
    new="${MAPPINGS[offset + 2]}"

    if [[ -L "$target" ]]; then
      if ! final="$(resolve_chain "$target")"; then
        states[i]='ABORT'
        diagnostics[i]='unsafe symlink chain'
        abort=1
      elif [[ "$final" == "$new" ]]; then
        states[i]='SKIP'
        diagnostics[i]="already points to $new"
      elif [[ "$final" == "$legacy" ]]; then
        states[i]='REMOVE'
        diagnostics[i]="legacy target resolves to $legacy"
      else
        states[i]='ABORT'
        diagnostics[i]="foreign symlink resolves to $final"
        abort=1
      fi
    elif [[ -e "$target" ]]; then
      states[i]='ABORT'
      diagnostics[i]='non-symlink object exists at the target'
      abort=1
    else
      states[i]='SKIP'
      diagnostics[i]='target does not exist'
    fi

    i=$((i + 1))
  done

  if (( abort != 0 )); then
    printf '%s\n' '事前確認を中止しました。旧シンボリックリンクは削除していません。' >&2
    i=0
    while (( i < mapping_count )); do
      offset=$((i * 3))
      target="${MAPPINGS[offset]}"
      printf '%s: %s — %s\n' "${states[i]}" "$target" "${diagnostics[i]}" >&2
      i=$((i + 1))
    done
    return 1
  fi

  i=0
  while (( i < mapping_count )); do
    offset=$((i * 3))
    target="${MAPPINGS[offset]}"
    diagnostic="${diagnostics[i]}"
    printf '%s: %s — %s\n' "${states[i]}" "$target" "$diagnostic"
    i=$((i + 1))
  done

  i=0
  while (( i < mapping_count )); do
    if [[ "${states[i]}" == 'REMOVE' ]]; then
      offset=$((i * 3))
      target="${MAPPINGS[offset]}"
      rm "$target"
      printf 'REMOVED: %s\n' "$target"
      removed=$((removed + 1))
    fi
    i=$((i + 1))
  done

  if (( removed == 0 )); then
    printf '%s\n' '削除が必要な旧シンボリックリンクはありません。'
  fi
}

if [[ "${ZSH_EVAL_CONTEXT:-}" == "toplevel" ]]; then
  main "$@"
fi
