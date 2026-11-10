{
  config,
  lib,
  pkgs,
  ...
}:
let
  stateDir = "${config.xdg.stateHome}/cgt";
  python = pkgs.python3.withPackages (ps: [
    ps.tomlkit
    ps.ruamel-yaml
  ]);
  profiles = pkgs.linkFarm "terminal-theme-profiles" (
    lib.concatMap
      (
        mode:
        let
          dark = mode == "dark";
          colors =
            if dark then
              {
                fg = "#cccccc";
                muted = "#868686";
                blue = "#3b8eea";
                red = "#f14c4c";
                green = "#0dbc79";
                selection = "#264f78";
              }
            else
              {
                fg = "#657b83";
                muted = "#93a1a1";
                blue = "#268bd2";
                red = "#dc322f";
                green = "#859900";
                selection = "#eee8d5";
              };
          files = {
            "codex.tmTheme" = builtins.readFile ./dark-modern.codex.tmTheme;
            ghostty = import ./ghostty-config.nix { inherit dark; };
            "herdr.toml" =
              builtins.replaceStrings
                [ ''name = "solarized-light"'' ]
                [ (if dark then ''name = "catppuccin"'' else ''name = "solarized-light"'') ]
                (builtins.readFile ../../cli/herdr/config.toml)
              + lib.optionalString dark ("\n" + builtins.readFile ./dark-modern.herdr.toml);
            "helix.toml" =
              builtins.replaceStrings
                [ ''theme = "solarized_light"'' ]
                [ (if dark then ''theme = "cgt-dark-modern"'' else ''theme = "solarized_light"'') ]
                (builtins.readFile ../../cli/helix/config.toml);
            "opencode.json" = builtins.toJSON (
              (import ../../cli/opencode/cli.nix)
              // {
                theme = {
                  name = if dark then "cgt-dark-modern" else "solarized";
                  inherit mode;
                };
              }
            );
            "lazygit.json" = builtins.toJSON {
              activeBorderColor = [
                colors.blue
                "bold"
              ];
              inactiveBorderColor = [ colors.muted ];
              searchingActiveBorderColor = [
                colors.green
                "bold"
              ];
              optionsTextColor = [ colors.blue ];
              selectedLineFgColor = [ colors.fg ];
              selectedLineBgColor = [ colors.selection ];
              inactiveViewSelectedLineBgColor = [ colors.selection ];
              cherryPickedCommitFgColor = [ colors.blue ];
              cherryPickedCommitBgColor = [ colors.selection ];
              markedBaseCommitFgColor = [ colors.green ];
              markedBaseCommitBgColor = [ colors.selection ];
              unstagedChangesColor = [ colors.red ];
              defaultFgColor = [ colors.fg ];
            };
          };
        in
        lib.mapAttrsToList (name: text: {
          name = "${mode}/${name}";
          path = pkgs.writeText "cgt-${mode}-${name}" text;
        }) files
      )
      [
        "light"
        "dark"
      ]
  );
  cgt = pkgs.writeShellApplication {
    name = "cgt";
    runtimeInputs = [
      pkgs.herdr
      pkgs.lazygit
    ];
    text = ''
      exec ${python}/bin/python ${./cgt.py} --profiles ${profiles} --state-dir ${lib.escapeShellArg stateDir} "$@"
    '';
  };
in
{
  home.packages = [ cgt ];
  xdg.configFile =
    lib.mapAttrs
      (_: file: {
        source = config.lib.file.mkOutOfStoreSymlink "${stateDir}/current/${file}";
      })
      {
        "ghostty/config" = "ghostty";
        "herdr/config.toml" = "herdr.toml";
        "helix/config.toml" = "helix.toml";
      }
    // {
      "helix/themes/cgt-dark-modern.toml".source = ./dark-modern.helix.toml;
      "opencode/themes/cgt-dark-modern.json".source = ./dark-modern.opencode.json;
    };
  home.file.".config/opencode/cli.json".source =
    config.lib.file.mkOutOfStoreSymlink "${stateDir}/current/opencode.json";

  # Seed the mutable selector before linking configs. Preserve the selected mode
  # on subsequent activations, while picking up the new generation's profiles.
  home.activation.terminalTheme = lib.hm.dag.entryBetween [ "linkGeneration" ] [ "writeBoundary" ] ''
    run ${cgt}/bin/cgt --initialize
  '';
}
