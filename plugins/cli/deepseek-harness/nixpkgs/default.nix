{
  home =
    { pkgs, ... }:
    {
      home.packages = [ pkgs.deepseek-harness ];
    };
  overlays = [
    (_final: prev: {
      deepseek-harness = prev.callPackage ./package.nix { inherit (prev) deepseek-harness; };
    })
  ];
}
