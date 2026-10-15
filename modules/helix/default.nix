{ lib, pkgs, ... }:
{
  home.file.".config/helix/yazi-picker.sh" = {
    executable = true;
    text = ''
      #!${lib.getExe pkgs.bash}
      set -euo pipefail

      tmp="''${TMPDIR:-/tmp}/yazi-chosen-$$"
      trap 'rm -f "$tmp"' EXIT

      ${lib.getExe pkgs.yazi} --chooser-file="$tmp"

      if [[ -s "$tmp" ]]; then
        paths="$(cat "$tmp")"

        if [[ "$paths" == search://* ]]; then
          paths="$(printf '%s\n' "$paths" | ${lib.getExe pkgs.gnused} 's|search://[^/]*/||')"
        fi

        ${lib.getExe pkgs.zellij} action toggle-floating-panes
        ${lib.getExe pkgs.zellij} action write 27
        ${lib.getExe pkgs.zellij} action write-chars ":open \"$paths\""
        ${lib.getExe pkgs.zellij} action write 13
      else
        ${lib.getExe pkgs.zellij} action toggle-floating-panes
      fi
    '';
  };

  programs.helix = {
    enable = true;

    settings = {
      theme = "catppuccin_mocha";
      keys.normal."C-y" =
        ":sh ${lib.getExe pkgs.zellij} run -n Yazi -c -f -x 10%% -y 10%% --width 80%% --height 80%% -- ${lib.getExe pkgs.bash} ~/.config/helix/yazi-picker.sh";
      editor = {
        cursor-shape = {
          normal = "block";
          insert = "bar";
          select = "underline";
        };
        line-number = "relative";
        bufferline = "always";
        true-color = true;
        idle-timeout = 400;
      };
    };

    languages = {
      language = [
        {
          name = "nix";
          auto-format = true;
          formatter.command = lib.getExe pkgs.nixfmt;
        }
      ];
    };
  };
}
