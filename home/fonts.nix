{ pkgs, lib, ... }:
{
  home.packages = [
    pkgs.nerd-fonts.jetbrains-mono
    pkgs.nerd-fonts.fira-code
  ];

  fonts.fontconfig.enable = true;

  # macOSのネイティブアプリ用に~/Library/Fonts/HomeManagerへフォントをコピー
  # fontconfigベースのアプリはfonts.fontconfig.enableで対応
  home.activation.installFonts = lib.hm.dag.entryAfter [ "installPackages" ] ''
    FONT_DST="$HOME/Library/Fonts/HomeManager"
    rm -rf "$FONT_DST"
    mkdir -p "$FONT_DST"
    find "${pkgs.nerd-fonts.jetbrains-mono}/share/fonts" \( -name "*.ttf" -o -name "*.otf" \) -exec cp -f {} "$FONT_DST/" \;
    find "${pkgs.nerd-fonts.fira-code}/share/fonts" \( -name "*.ttf" -o -name "*.otf" \) -exec cp -f {} "$FONT_DST/" \;
  '';
}
