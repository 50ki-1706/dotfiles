{
  home =
    { pkgs, ... }:
    {
      home.packages = [ pkgs.herdr ];
    };
}
