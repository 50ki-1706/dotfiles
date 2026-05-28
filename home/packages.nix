{ pkgs, ollamaPkgs, ... }:
{
  home.packages = [
    pkgs.git
    pkgs.yazi
    pkgs.zellij
    ollamaPkgs.ollama
  ];
}
