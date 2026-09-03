{ pkgs, ollamaPkgs, ... }:
{
  home.packages = [
    pkgs.fzf
    pkgs.git
    pkgs.lazygit
    pkgs.bitwarden-cli
    pkgs.devbox
    pkgs.nixfmt
    pkgs.ripgrep
    pkgs.yazi
    pkgs.yq-go
    pkgs.zellij
    pkgs.claude-code
    pkgs.uv
    pkgs.nodejs
    pkgs.vite-plus
    ollamaPkgs.ollama
  ];
}
