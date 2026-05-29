{ pkgs, lib, ... }:
{
  home.file.".config/helix/yazi-picker.sh" = {
    executable = true;
    text = ''
      #!${pkgs.bash}/bin/bash
      set -euo pipefail

      tmp="''${TMPDIR:-/tmp}/yazi-chosen-$$"
      trap 'rm -f "$tmp"' EXIT

      ${pkgs.yazi}/bin/yazi --chooser-file="$tmp"

      if [[ -s "$tmp" ]]; then
        paths="$(cat "$tmp")"

        if [[ "$paths" == search://* ]]; then
          paths="$(printf '%s\n' "$paths" | ${pkgs.gnused}/bin/sed 's|search://[^/]*/||')"
        fi

        ${pkgs.zellij}/bin/zellij action toggle-floating-panes
        ${pkgs.zellij}/bin/zellij action write 27
        ${pkgs.zellij}/bin/zellij action write-chars ":open \"$paths\""
        ${pkgs.zellij}/bin/zellij action write 13
      else
        ${pkgs.zellij}/bin/zellij action toggle-floating-panes
      fi
    '';
  };

  programs.helix = {
    enable = true;

    settings = {
      theme = "catppuccin_mocha";
      keys.normal."C-y" =
        ":sh zellij run -n Yazi -c -f -x 10%% -y 10%% --width 80%% --height 80%% -- bash ~/.config/helix/yazi-picker.sh";
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
