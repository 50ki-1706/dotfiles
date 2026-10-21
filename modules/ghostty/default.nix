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

  # リンク先は評価中のworktreeではなく、メインcheckoutの `${config.home.homeDirectory}/.dotfiles`。
  xdg.configFile."ghostty/config".source =
    config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/modules/ghostty/config";

  # macOS 固有の設定パスでも同じ設定を参照する。
  home.file."Library/Application Support/com.mitchellh.ghostty/config".source =
    config.xdg.configFile."ghostty/config".source;
}
