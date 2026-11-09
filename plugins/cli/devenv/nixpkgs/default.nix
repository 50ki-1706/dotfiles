{
  home =
    { pkgs, ... }:
    {
      home.packages = [ pkgs.devenv ];
    };
}
