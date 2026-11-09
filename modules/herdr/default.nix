{ config, ... }:
{
  # cgt が選択したプロファイルを参照する。
  xdg.configFile."herdr/config.toml".source =
    config.lib.file.mkOutOfStoreSymlink "${config.xdg.stateHome}/cgt/current/herdr.toml";
}
