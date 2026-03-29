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
      devShells = forAllSystems (
        system:
        let
          pkgs = import nixpkgs {
            inherit system;
            config.allowUnfree = true;
          };
          isDarwin = nixpkgs.lib.hasSuffix "darwin" system;

          ghosttyPkg = if isDarwin then pkgs.ghostty-bin else pkgs.ghostty;
        in
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.git
              pkgs.nodejs_24
              ghosttyPkg
              pkgs.vscode
              pkgs.nixd # ← LSPサーバー
              pkgs.nixfmt-rfc-style # ← フォーマッター
            ];
          };
        }
      );
    };
}
