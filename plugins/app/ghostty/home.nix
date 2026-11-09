{
  config,
  lib,
  ...
}:
{
  xdg.configFile."ghostty/config".source = lib.mkDefault ./config;

  # macOS 固有の設定パスでも同じ設定を参照する。
  home.file."Library/Application Support/com.mitchellh.ghostty/config".source =
    config.xdg.configFile."ghostty/config".source;
}
