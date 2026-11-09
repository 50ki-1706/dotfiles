{
  config,
  pkgs,
  ...
}:
{
  programs.ghostty = {
    enable = true;
    package = pkgs.ghostty-bin;
  };

  # cgt が選択する書き込み可能な状態ディレクトリを参照する。
  xdg.configFile."ghostty/config".source =
    config.lib.file.mkOutOfStoreSymlink "${config.xdg.stateHome}/cgt/current/ghostty";

  # macOS 固有の設定パスでも同じ設定を参照する。
  home.file."Library/Application Support/com.mitchellh.ghostty/config".source =
    config.xdg.configFile."ghostty/config".source;
}
