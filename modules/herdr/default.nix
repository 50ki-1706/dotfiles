{ config, ... }:
{
  # リンク先は評価中のworktreeではなく、メインcheckoutの `${config.home.homeDirectory}/.dotfiles`。
  xdg.configFile."herdr/config.toml".source =
    config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/modules/herdr/config.toml";
}
