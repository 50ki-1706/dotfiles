{ config, lib, ... }:
{
  xdg.configFile."helix/config.toml".source = lib.mkDefault ./config.toml;

  # languages.toml は引き続きメイン checkout を参照する。
  xdg.configFile."helix/languages.toml".source =
    config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/plugins/cli/helix/languages.toml";
}
