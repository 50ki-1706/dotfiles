{
  config,
  lib,
  pkgs,
  ...
}:
{
  programs.ghostty = {
    enable = true;
    package = pkgs.ghostty-bin;
    settings = {
      command = "direct:${lib.getExe pkgs.herdr} --session ghostty";
      font-family = "JetBrainsMono Nerd Font Mono";
      theme = "iTerm2 Solarized Light";
      background-opacity = 0.92;
      background-opacity-cells = true;
    };
  };

  # macOS 固有の設定パスにも、programs.ghostty.settings の生成物を配置する。
  home.file."Library/Application Support/com.mitchellh.ghostty/config".source =
    config.xdg.configFile."ghostty/config".source;
}
