{
  description = "Koki's environments";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
    nixpkgs-ollama.url = "github:nixos/nixpkgs/dfd9566f82a6e1d55c30f861879186440614696e";
    vite-plus.url = "github:ryoppippi/nix-vite-plus";
    home-manager = {
      # stdenv.is* 非推奨対応を含む最小更新。最新版は programs.opencode など、この構成が使う他モジュールにも変更が及ぶため対象外。
      url = "github:nix-community/home-manager/0668fdbc15bd602e463cab37ff64346021193652";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      nixpkgs-ollama,
      home-manager,
      vite-plus,
    }:
    let
      forAllSystems = nixpkgs.lib.genAttrs [
        "aarch64-darwin"
        "x86_64-linux"
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
        in
        {
          "ssh-bootstrap" = import ./packages/ssh-bootstrap.nix pkgs;
        }
        // nixpkgs.lib.optionalAttrs (system == "aarch64-darwin") {
          # Drift checker for the OpenCode permission action space. Darwin only,
          # because the pinned OpenCode package is aarch64-darwin only.
          opencodeActionCheck = pkgs.callPackage ./packages/opencode-action-check.nix {
            opencode = pkgs.callPackage ./packages/opencode.nix { };
          };
        }
      );

      formatter = forAllSystems (system: nixpkgs.legacyPackages.${system}.nixfmt-tree);

      apps = forAllSystems (system: {
        "ssh-bootstrap" = {
          type = "app";
          program = "${self.packages.${system}."ssh-bootstrap"}/bin/ssh-bootstrap";
        };
      });

      homeConfigurations."koki" =
        let
          pkgs = import nixpkgs {
            system = "aarch64-darwin";
            config.allowUnfree = true;
            overlays = [ vite-plus.overlays.default ];
          };
        in
        home-manager.lib.homeManagerConfiguration {
          inherit pkgs;
          extraSpecialArgs = {
            # Intent: M5 Mac で動作する最新バージョン（0.20.3）に固定。これ以降のバージョンはバグで動作しない。
            ollamaPkgs = import nixpkgs-ollama {
              system = "aarch64-darwin";
              config.allowUnfree = true;
            };
            isDarwin = pkgs.stdenv.hostPlatform.isDarwin;
          };
          modules = [
            ./home.nix
          ];
        };
    };
}
