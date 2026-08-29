{ lib, ... }:
{
  programs.zsh = {
    enable = true;
    initContent = lib.mkMerge [
      (lib.mkOrder 1000 ''
        if [[ -f ~/.config/shell/aliases ]]; then
          source ~/.config/shell/aliases
        fi
      '')
      (lib.mkOrder 1400 ''
        if command -v wt >/dev/null 2>&1; then eval "$(wt config shell init zsh)" 2>/dev/null; fi
      '')
      (lib.mkOrder 1500 ''
        if [[ -f ~/.zshrc.local ]]; then
          source ~/.zshrc.local
        fi
      '')
    ];
  };

  home.file.".config/shell/aliases".source = ./dotfiles/shell/aliases;
}
