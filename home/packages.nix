{ pkgs, ollamaPkgs, ... }:
{
  home.packages = [
    pkgs.git
    pkgs.mise
    ollamaPkgs.ollama
  ];
}
