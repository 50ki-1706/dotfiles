{
  home =
    { pkgs, ... }:
    {
      home.packages = [ pkgs.codex ];
    };
}
