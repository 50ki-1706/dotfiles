{
  description = "Koki's environments";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
    nixpkgs-ollama.url = "github:nixos/nixpkgs/dfd9566f82a6e1d55c30f861879186440614696e";
    vite-plus.url = "github:ryoppippi/nix-vite-plus";
    nix-darwin = {
      url = "github:nix-darwin/nix-darwin";
      inputs.nixpkgs.follows = "nixpkgs";
    };
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
      nix-darwin,
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
      darwinPkgs = mkPkgs {
        system = "aarch64-darwin";
        overlays = [ vite-plus.overlays.default ];
      };
      # Intent: M5 Mac で動作する最新バージョン（0.20.3）に固定。これ以降のバージョンはバグで動作しない。
      ollamaPkgs = mkPkgs {
        system = "aarch64-darwin";
        source = nixpkgs-ollama;
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

      apps = forAllSystems (
        system:
        {
          "ssh-bootstrap" = {
            type = "app";
            program = "${self.packages.${system}."ssh-bootstrap"}/bin/ssh-bootstrap";
          };
        }
        // nixpkgs.lib.optionalAttrs (system == "aarch64-darwin") {
          darwin-rebuild = {
            type = "app";
            program = "${nix-darwin.packages.${system}.darwin-rebuild}/bin/darwin-rebuild";
          };
        }
      );

      homeConfigurations."koki" = home-manager.lib.homeManagerConfiguration {
        pkgs = darwinPkgs;
        extraSpecialArgs = { inherit ollamaPkgs; };
        modules = [
          ./home.nix
        ];
      };

      darwinConfigurations.mac = nix-darwin.lib.darwinSystem {
        system = "aarch64-darwin";
        pkgs = darwinPkgs;
        specialArgs = { inherit ollamaPkgs; };
        modules = [
          home-manager.darwinModules.home-manager
          ./hosts/mac.nix
        ];
      };
    };
}
