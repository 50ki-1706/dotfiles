{
  home =
    { pkgs, ... }:
    {
      programs.opencode = {
        enable = true;
        package = pkgs.callPackage ./package.nix { };
      };
    };
}
