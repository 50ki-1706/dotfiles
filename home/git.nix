{ config, ... }:
{
  programs.git = {
    enable = true;

    signing = {
      format = "ssh";
    };

    settings = {
      core = {
        excludesFile = "~/.config/git/ignore";
      };
    };

    includes = [
      { path = "~/.config/git/accounts.include"; }
    ];
  };

  home.file.".config/git/ignore".source =
    config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/home/dotfiles/git/ignore";
}
