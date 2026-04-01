{
  description = "Koki's environments";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      home-manager,
    }:
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
            config.allowUnfree = true;
          };
          # SSH 鍵の生成のみ担当。~/.ssh/config は home-manager が管理する。
          sshBootstrap = pkgs.writeShellApplication {
            name = "ssh-bootstrap";
            runtimeInputs = [
              pkgs.coreutils
              pkgs.openssh
            ];
            text = ''
              set -euo pipefail

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
          "ssh-bootstrap" = sshBootstrap;
        }
      );

      formatter = forAllSystems (
        system: nixpkgs.legacyPackages.${system}.nixfmt-rfc-style
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

      homeConfigurations."koki" = home-manager.lib.homeManagerConfiguration {
        pkgs = nixpkgs.legacyPackages.aarch64-darwin;
        modules = [
          (
            { pkgs, lib, ... }:
            {
              home.username = "koki";
              home.homeDirectory = "/Users/koki";
              home.stateVersion = "24.11";

              home.packages = [
                pkgs.git
                pkgs.mise
                pkgs.openssh
              ];

              programs.ssh = {
                enable = true;
                matchBlocks."github.com" = {
                  hostname = "github.com";
                  user = "git";
                  identityFile = "~/.ssh/id_ed25519";
                  identitiesOnly = true;
                  extraOptions =
                    {
                      AddKeysToAgent = "yes";
                    }
                    // lib.optionalAttrs pkgs.stdenv.isDarwin {
                      UseKeychain = "yes";
                    };
                };
              };
            }
          )
        ];
      };
    };
}
