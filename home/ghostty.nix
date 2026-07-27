{ pkgs, config, ... }:
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

  # macOS の Ghostty は XDG パスを読まないため、ネイティブの設定パスにも同じ生成物を配置する。
  # 設定の正は programs.ghostty.settings のみとし、ここでは生成済みファイルを参照するだけにする。
  home.file."Library/Application Support/com.mitchellh.ghostty/config".source =
    config.xdg.configFile."ghostty/config".source;
}
