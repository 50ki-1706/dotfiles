{
  home =
    { pkgs, ... }:
    {
      home.packages = [ pkgs.yq-go ];
    };
}
