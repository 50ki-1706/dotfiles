{
  description = "Koki's environments";

  inputs.nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";

  outputs =
    { self, nixpkgs }:
    let
      forAllSystems = nixpkgs.lib.genAttrs [
        "aarch64-darwin" # Apple Silicon Mac
        "x86_64-linux" # Ubuntu PC
      ];
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = import nixpkgs {
            inherit system;
            config.allowUnfree = true;[p]
          };
          sshBootstrap = pkgs.writeShellApplication {
            name = "ssh-bootstrap";
            runtimeInputs = [
              pkgs.coreutils
              pkgs.openssh
            ];
            text = ''
              set -euo pipefail
p
              email=""
              key_path="$HOME/.ssh/id_ed25519"

              while [ "$#" -gt 0 ]; do
                case "$1" in
                  --email)
                    email="$2"
                    shift 2
                    ;;
                  --key-path)
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
                echo "Usage: nix run .#ssh-bootstrap -- --email you@example.com [--key-path ~/.ssh/id_ed25519]" >&2
                exit 1
              fi

              mkdir -p "$HOME/.ssh"
              chmod 700 "$HOME/.ssh"

              if [ -e "$key_path" ]; then
                echo "SSH key already exists at $key_path"
              else
                ssh-keygen -t ed25519 -C "$email" -f "$key_path" -N ""
              fi

              if [ "$(uname -s)" = "Darwin" ]; then
                touch "$HOME/.ssh/config"
                if ! grep -q "^Host github.com$" "$HOME/.ssh/config"; then
                  {
                    printf '%s\n' "Host github.com"
                    printf '%s\n' "  HostName github.com"
                    printf '%s\n' "  User git"
                    printf '%s\n' "  IdentityFile $key_path"
                    printf '%s\n' "  IdentitiesOnly yes"
                    printf '%s\n' "  AddKeysToAgent yes"
                    printf '%s\n' "  UseKeychain yes"
                  } >> "$HOME/.ssh/config"
                fi
                chmod 600 "$HOME/.ssh/config"
                /usr/bin/ssh-add --apple-use-keychain "$key_path" >/dev/null 2>&1 || true
              fi

              echo
              echo "Public key:"
              cat "$key_path.pub"
              echo
              echo "Next:"
              echo "  1. Add the public key to GitHub or your Git server"
              echo "  2. Test with: ssh -T git@github.com"
            '';
          };
        in
        {
          git = pkgs.git;
          openssh = pkgs.openssh;
          "ssh-bootstrap" = sshBootstrap;
          default = pkgs.buildEnv {
            name = "dotfiles-base";
            paths = [
              pkgs.git
              pkgs.openssh
            ];
          };
        }
      );

      apps = forAllSystems (
        system:
        {
          "ssh-bootstrap" = {
            type = "app";
            program = "${self.packages.${system}."ssh-bootstrap"}/bin/ssh-bootstrap";
          };
        }
      );

      devShells = forAllSystems (
        system:
        let
          pkgs = import nixpkgs {
            inherit system;
            config.allowUnfree = true;
          };
        in
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.git
              pkgs.openssh
              pkgs.nodejs_24
              pkgs.nixd # ← LSPサーバー
              pkgs.nixfmt-rfc-style # ← フォーマッター
            ];
          };
        }
      );
    };
}
