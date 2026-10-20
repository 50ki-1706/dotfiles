{
  config,
  lib,
  pkgs,
  ...
}:
{
  # リンク先は評価中のworktreeではなく、メインcheckoutの `${config.home.homeDirectory}/.dotfiles`。
  home.file = lib.mkIf pkgs.stdenv.hostPlatform.isDarwin {
    "Library/Application Support/Code/User/settings.json".source =
      config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/modules/vscode/settings.json";
    "Library/Application Support/Code/User/keybindings.json".source =
      config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/modules/vscode/keybindings.json";
  };
}
