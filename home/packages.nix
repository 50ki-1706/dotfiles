{ pkgs, ollamaPkgs, ... }:
{
  home.packages = [
    pkgs.git
    ollamaPkgs.ollama
  ];
}
