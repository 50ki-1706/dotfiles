{ pkgs, ollamaPkgs, ... }:
{
  home.packages = [
    pkgs.devbox
    pkgs.nixfmt
    pkgs.claude-code
    ollamaPkgs.ollama
  ];
}
