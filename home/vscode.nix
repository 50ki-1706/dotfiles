{
  config,
  lib,
  isDarwin,
  ...
}:
{
  home.file = lib.mkIf isDarwin {
    "Library/Application Support/Code/User/settings.json".source =
      config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/home/dotfiles/vscode/settings.json";
    "Library/Application Support/Code/User/keybindings.json".source =
      config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/home/dotfiles/vscode/keybindings.json";
  };
}
