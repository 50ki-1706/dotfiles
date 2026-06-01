{ pkgs, ollamaPkgs, ... }:
{
  home.packages = [
    pkgs.fzf
    pkgs.gcc
    pkgs.git
    pkgs.lazygit
    pkgs.devbox
    pkgs.nixfmt
    pkgs.ripgrep
    pkgs.yazi
    pkgs.zellij
    ollamaPkgs.ollama
  ];
}
