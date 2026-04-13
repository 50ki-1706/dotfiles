{
  description = "Koki's environments";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
    nixpkgs-ollama.url = "github:nixos/nixpkgs/dfd9566f82a6e1d55c30f861879186440614696e";
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      nixpkgs-ollama,
      home-manager,
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
      );

      formatter = forAllSystems (system: nixpkgs.legacyPackages.${system}.nixfmt-rfc-style);

      apps = forAllSystems (system: {
        "ssh-bootstrap" = {
          type = "app";
          program = "${self.packages.${system}."ssh-bootstrap"}/bin/ssh-bootstrap";
        };
      });

      homeConfigurations."koki" = home-manager.lib.homeManagerConfiguration {
        pkgs = nixpkgs.legacyPackages.aarch64-darwin;
        extraSpecialArgs = {
          # Intent: M5 Mac で動作する最新バージョン（0.20.3）に固定。これ以降のバージョンはバグで動作しない。
          ollamaPkgs = import nixpkgs-ollama {
            system = "aarch64-darwin";
            config.allowUnfree = true;
          };
        };
        modules = [
          ./home
        ];
      };
    };
}
