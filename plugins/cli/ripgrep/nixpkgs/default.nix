{
  home =
    { pkgs, ... }:
    {
      home.packages = [ pkgs.ripgrep ];
    };
}
