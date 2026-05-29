{ pkgs, ollamaPkgs, ... }:
{
  home.packages = [
    pkgs.fzf
    pkgs.git
    pkgs.ripgrep
    pkgs.yazi
    pkgs.zellij
    ollamaPkgs.ollama
  ];
}
