{ lib, ... }:
{
  xdg.configFile."herdr/config.toml".source = lib.mkDefault ./config.toml;
}
