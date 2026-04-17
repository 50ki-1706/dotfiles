pkgs:
pkgs.writeShellApplication {
  name = "ssh-bootstrap";
  runtimeInputs = [
    pkgs.coreutils
    pkgs.openssh
  ];
  text = ''
    set -euo pipefail

    email=""
    account=""
    key_path=""

    while [ "$#" -gt 0 ]; do
      case "$1" in
        --email)
          if [ "$#" -lt 2 ]; then
            echo "--email には値が必要です" >&2
            exit 1
          fi
          email="$2"
          shift 2
          ;;
        --account)
          if [ "$#" -lt 2 ]; then
            echo "--account には値が必要です" >&2
            exit 1
          fi
          account="$2"
          shift 2
          ;;
        --key-path)
          if [ "$#" -lt 2 ]; then
            echo "--key-path には値が必要です" >&2
            exit 1
          fi
          key_path="$2"
          shift 2
          ;;
        *)
          echo "Unknown argument: $1" >&2
          exit 1
          ;;
      esac
    done

    if [ -z "$email" ]; then
      echo "Usage: nix run .#ssh-bootstrap -- --email you@example.com [--account work] [--key-path ~/.ssh/id_ed25519]" >&2
      exit 1
    fi

    # Intent: デフォルトアカウントは --account なしで運用する設計との整合性を保つ
    if [ "$account" = "personal" ]; then
      echo "デフォルトアカウントは --account なしで実行してください" >&2
      exit 1
    fi

    if [ -n "$account" ]; then
      key_path="''${key_path:-$HOME/.ssh/id_ed25519_$account}"
    else
      key_path="''${key_path:-$HOME/.ssh/id_ed25519}"
    fi

    mkdir -p "$HOME/.ssh"
    chmod 700 "$HOME/.ssh"

    if [ -e "$key_path" ]; then
      echo "SSH key already exists at $key_path"
    else
      ssh-keygen -t ed25519 -C "$email" -f "$key_path" -N ""
    fi

    if [ "$(uname -s)" = "Darwin" ]; then
      /usr/bin/ssh-add --apple-use-keychain "$key_path" >/dev/null 2>&1 || true
    fi

    echo
    echo "Public key:"
    cat "$key_path.pub"
    echo
    echo "Next:"
    echo "  1. Add the public key to GitHub or your Git server"
    if [ -n "$account" ]; then
      echo "  2. Test with: ssh -i $key_path -o IdentitiesOnly=yes -T git@github.com"
    else
      echo "  2. Test with: ssh -T git@github.com"
    fi
  '';
}
