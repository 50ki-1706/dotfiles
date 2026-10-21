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

  # リンク先は評価中のworktreeではなく、メインcheckoutの `${config.home.homeDirectory}/.dotfiles`。
  xdg.configFile."helix/config.toml".source =
    config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/modules/helix/config.toml";

  xdg.configFile."helix/languages.toml".source =
    config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/modules/helix/languages.toml";
}
