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
      mkPkgs =
        {
          system,
          source ? nixpkgs,
          overlays ? [ ],
        }:
        import source {
          inherit system overlays;
          config.allowUnfree = true;
        };
      # ssh-bootstrap・formatter・appを両システムで公開し、homeConfigurationsはaarch64-darwin固定。
      forAllSystems = nixpkgs.lib.genAttrs [
        "aarch64-darwin"
        "x86_64-linux"
      ];
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = mkPkgs { inherit system; };
        in
        {
          "ssh-bootstrap" = pkgs.callPackage ./packages/ssh-bootstrap.nix { };
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
          pkgs = mkPkgs {
            system = "aarch64-darwin";
            overlays = [ vite-plus.overlays.default ];
          };
        in
        home-manager.lib.homeManagerConfiguration {
          inherit pkgs;
          extraSpecialArgs = {
            # Intent: M5 Mac で動作する最新バージョン（0.20.3）に固定。これ以降のバージョンはバグで動作しない。
            ollamaPkgs = mkPkgs {
              system = "aarch64-darwin";
              source = nixpkgs-ollama;
            };
          };
          modules = [
            ./home.nix
          ];
        };
    };
}
