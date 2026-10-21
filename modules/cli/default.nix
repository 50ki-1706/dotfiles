{ pkgs, ... }:
{
  home.packages = [
    pkgs.fzf
    pkgs.lazygit
    pkgs.bitwarden-cli
    pkgs.devenv
    pkgs.ripgrep
    pkgs.yq-go
    pkgs.claude-code
    pkgs.herdr
    (pkgs.callPackage ../../packages/playwright-cli.nix { })
  ];
}
