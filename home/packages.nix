{ pkgs, ollamaPkgs, ... }:
{
  home.packages = [
    pkgs.fzf
    pkgs.git
    pkgs.devbox
    pkgs.nixfmt
    pkgs.ripgrep
    pkgs.yazi
    pkgs.zellij
    ollamaPkgs.ollama
  ];
}
