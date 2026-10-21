{ pkgs, ollamaPkgs, ... }:
{
  home.packages = [
    pkgs.fzf
    pkgs.lazygit
    pkgs.bitwarden-cli
    pkgs.devenv
    pkgs.ripgrep
    pkgs.yq-go
    pkgs.claude-code
    pkgs.vite-plus
    pkgs.uv
    pkgs.nodejs_24
    pkgs.herdr
    (pkgs.callPackage ../../packages/playwright-cli.nix { })
    ollamaPkgs.ollama
  ];
}
