{ inputs, ... }:
{
  home =
    { pkgs, ... }:
    {
      home.packages = [ pkgs.git-surgeon ];
    };
  overlays = [
    (_final: prev: {
      git-surgeon = inputs.git-surgeon.packages.${prev.stdenv.hostPlatform.system}.default;
    })
  ];
}
