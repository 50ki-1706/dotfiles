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

      init = {
        defaultBranch = "main";
      };
    };

    # scripts/install.sh が呼び出す scripts/lib/accounts.sh が生成する（Nix は生成しない）。
    includes = [
      { path = "~/.config/git/accounts.include"; }
    ];
  };

  # リンク先は評価中のworktreeではなく、メインcheckoutの `${config.home.homeDirectory}/.dotfiles`。
  home.file.".config/git/ignore".source =
    config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/modules/git/ignore";
}
