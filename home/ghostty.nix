{ pkgs, ... }:
let
  ghosttyZellij = pkgs.writeShellScript "ghostty-zellij" ''
    exec ${pkgs.zellij}/bin/zellij attach -c ghostty
  '';
in
{
  programs.ghostty = {
    enable = true;
    package = pkgs.ghostty-bin;
    settings = {
      command = "${ghosttyZellij}";
      font-family = "JetBrainsMono Nerd Font Mono";
    };
  };
}
