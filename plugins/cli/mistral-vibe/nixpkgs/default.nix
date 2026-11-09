{
  home =
    { pkgs, ... }:
    {
      home.packages = [ pkgs.mistral-vibe ];
    };
  overlays = [
    (_final: prev: {
      mistral-vibe = prev.callPackage ./package.nix { inherit (prev) mistral-vibe; };
    })
  ];
}
