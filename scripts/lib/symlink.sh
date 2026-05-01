# This file is meant to be sourced with .

link_file_to() {
  local name="$1"
  local source_dir="$2"
  local target_dir="$3"
  local dest_name="${4:-$1}"
  local src="${source_dir}/${name}"
  local dst="${target_dir}/${dest_name}"

  if [[ ! -f "${src}" ]]; then
    echo "エラー: 元ファイルが見つかりません: ${src}" >&2
    exit 1
  fi

  if [[ -L "${dst}" ]]; then
    if [[ "$(readlink "${dst}")" == "${src}" ]]; then
      echo "既に設定済み: ${dst}"
      return
    fi
    local old_target
    old_target="$(readlink "${dst}")"
    rm "${dst}"
    echo "旧シンリンクを削除: ${dst} -> ${old_target} (復旧: ln -s \"${old_target}\" \"${dst}\")"
  elif [[ -e "${dst}" ]]; then
    local backup="${dst}.bak.$(date +%Y%m%d%H%M%S)"
    mv "${dst}" "${backup}"
    echo "既存ファイルを退避: ${backup}"
  fi

  ln -s "${src}" "${dst}"
  echo "作成: ${dst} -> ${src}"
}

link_dir_to() {
  local name="$1"
  local source_dir="$2"
  local target_dir="$3"
  local dest_name="${4:-$1}"
  local src="${source_dir}/${name}"
  local dst="${target_dir}/${dest_name}"

  if [[ ! -d "${src}" ]]; then
    echo "エラー: 元ディレクトリが見つかりません: ${src}" >&2
    exit 1
  fi

  if [[ -L "${dst}" ]]; then
    if [[ "$(readlink "${dst}")" == "${src}" ]]; then
      echo "既に設定済み: ${dst}"
      return
    fi
    local old_target
    old_target="$(readlink "${dst}")"
    rm "${dst}"
    echo "旧シンリンクを削除: ${dst} -> ${old_target} (復旧: ln -s \"${old_target}\" \"${dst}\")"
  elif [[ -e "${dst}" ]]; then
    local backup="${dst}.bak.$(date +%Y%m%d%H%M%S)"
    mv "${dst}" "${backup}"
    echo "既存ファイル/ディレクトリを退避: ${backup}"
  fi

  ln -s "${src}" "${dst}"
  echo "作成: ${dst} -> ${src}"
}
