{ lib, pkgs, ... }:
{
  home.packages = [ pkgs.zellij ];

  home.file.".config/zellij/layouts/ide.kdl".text =
    builtins.replaceStrings [ "@LAZYGIT@" ] [ (lib.getExe pkgs.lazygit) ]
      (builtins.readFile ./layouts/ide.kdl);
  home.file.".config/zellij/layouts/split.kdl".source = ./layouts/split.kdl;
  home.file.".config/zellij/config.kdl".source = ./config.kdl;
}
