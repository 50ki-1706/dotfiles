{ pkgs, ... }:
{
  xdg.dataFile."deepseek-harness/plugins/mistral-vibe".source = "${
    pkgs.callPackage ../../packages/dsh-mistral-vibe { }
  }/share/dsh-mistral-vibe";

  home.packages = [
    pkgs.fzf
    pkgs.lazygit
    pkgs.git-surgeon
    pkgs.bitwarden-cli
    pkgs.devenv
    pkgs.ripgrep
    pkgs.yq-go
    pkgs.claude-code
    pkgs.mistral-vibe
    pkgs.herdr
    pkgs.deepseek-harness
    (pkgs.callPackage ../../packages/playwright-cli.nix { })
  ];
}
