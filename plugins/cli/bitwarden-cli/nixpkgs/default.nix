{
  home =
    { pkgs, ... }:
    {
      home.packages = [ pkgs.bitwarden-cli ];
    };
}
