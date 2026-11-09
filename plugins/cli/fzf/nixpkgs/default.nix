{
  home =
    { pkgs, ... }:
    {
      home.packages = [ pkgs.fzf ];
    };
}
