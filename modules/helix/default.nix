{ config, pkgs, ... }:
{
  programs.helix = {
    enable = true;
    extraPackages = with pkgs; [
      vscode-langservers-extracted
      typescript-language-server
      tailwindcss-language-server
      elmPackages.elm-language-server
      gopls
      taplo
      nil
      pyright
    ];
  };

  # cgt が選択したプロファイルを参照する。
  xdg.configFile."helix/config.toml".source =
    config.lib.file.mkOutOfStoreSymlink "${config.xdg.stateHome}/cgt/current/helix.toml";

  # languages.toml は引き続きメイン checkout を参照する。
  xdg.configFile."helix/languages.toml".source =
    config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/modules/helix/languages.toml";
}
