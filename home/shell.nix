{ lib, ... }:
{
  programs.zsh = {
    enable = true;
    initContent = lib.mkMerge [
      (lib.mkOrder 980 ''
        if [[ -f ~/.config/shell/aliases ]]; then
          source ~/.config/shell/aliases
        fi
      '')
      (lib.mkOrder 990 ''
        if [[ -f ~/.zshrc.local ]]; then
          source ~/.zshrc.local
        fi
      '')
    ];
  };

  home.file.".config/shell/aliases".source = ./dotfiles/shell/aliases;
}
