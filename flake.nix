{
  description = "Koki's environments";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
    git-surgeon = {
      url = "github:raine/git-surgeon/ecf6dc42172ba757cc03bce1800ba1db45779f46";
      inputs.nixpkgs.follows = "nixpkgs";
    };
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
    inputs@{
      self,
      nixpkgs,
      home-manager,
      nix-darwin,
      ...
    }:
    let
      pluginRegistry = import ./lib/plugins.nix {
        inherit inputs;
        inherit (nixpkgs) lib;
        modules = [ ./plugins ];
      };
      mkPkgs =
        {
          system,
          overlays ? [ ],
        }:
        import nixpkgs {
          inherit system overlays;
          config.allowUnfree = true;
        };
      darwinPkgs = mkPkgs {
        system = "aarch64-darwin";
        overlays = pluginRegistry.overlays;
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
        pluginRegistry.packages (mkPkgs {
          inherit system;
        })
      );

      formatter = forAllSystems (system: nixpkgs.legacyPackages.${system}.nixfmt-tree);

      checks.aarch64-darwin.plugin-composition =
        let
          failures = import ./tests/plugins.nix { inherit inputs; };
        in
        assert nixpkgs.lib.assertMsg (failures == [ ]) (builtins.toJSON failures);
        darwinPkgs.runCommand "plugin-composition-check" { } "touch $out";

      apps = forAllSystems (
        system:
        pluginRegistry.apps self.packages.${system}
        // nixpkgs.lib.optionalAttrs (system == "aarch64-darwin") {
          darwin-rebuild = {
            type = "app";
            program = "${nix-darwin.packages.${system}.darwin-rebuild}/bin/darwin-rebuild";
          };
        }
      );

      homeConfigurations."koki" = home-manager.lib.homeManagerConfiguration {
        pkgs = darwinPkgs;
        modules = [
          pluginRegistry.home
          ./home.nix
        ];
      };

      darwinConfigurations.mac = nix-darwin.lib.darwinSystem {
        system = "aarch64-darwin";
        pkgs = darwinPkgs;
        modules = [
          home-manager.darwinModules.home-manager
          pluginRegistry.darwin
          ./hosts/mac.nix
          {
            home-manager.users.koki.imports = [
              pluginRegistry.home
              ./home.nix
            ];
          }
        ];
      };
    };
}
