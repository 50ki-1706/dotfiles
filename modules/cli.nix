{ pkgs, ollamaPkgs, ... }:
{
  home.packages = [
    pkgs.fzf
    pkgs.lazygit
    pkgs.bitwarden-cli
    pkgs.devbox
    pkgs.nixfmt
    pkgs.ripgrep
    pkgs.yazi
    pkgs.yq-go
    pkgs.claude-code
    pkgs.vite-plus
    ollamaPkgs.ollama
  ];
}
