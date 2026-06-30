{ pkgs, ollamaPkgs, ... }:
{
  home.packages = [
    pkgs.fzf
    pkgs.git
    pkgs.lazygit
    pkgs.devbox
    pkgs.nixfmt
    pkgs.ripgrep
    pkgs.yazi
    pkgs.yq-go
    pkgs.zellij
    pkgs.claude-code
    ollamaPkgs.ollama
  ];
}
