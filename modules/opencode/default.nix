{ pkgs, ... }:
let
  actions = import ./actions.nix;
  baselineActions =
    actions.coreActions
    ++ actions.opencodeActions
    ++ actions.mcpToolActions.graphify
    ++ actions.mcpToolActions.chromeDevtools;
in
{
  programs.opencode = {
    enable = true;
    package = pkgs.callPackage ../../packages/opencode.nix { };
    settings = import ./opencode.nix { };
  };

  home.file.".config/opencode/AGENTS.md" = {
    text = builtins.readFile ./AGENTS.md + "\n" + builtins.readFile ./prompts/output-format.md;
    force = true;
  };
  home.file.".config/opencode/plugins/spec-question-guard.js" = {
    source = ./plugins/spec-question-guard.js;
    force = true;
  };
  home.file.".config/opencode/plugins/action-drift-monitor.js" = {
    text = builtins.replaceStrings [ "@BASELINE_ACTIONS@" ] [ (builtins.toJSON baselineActions) ] (
      builtins.readFile ./plugins/action-drift-monitor.js
    );
    force = true;
  };
  home.file.".config/opencode/cli.json" = {
    text = builtins.toJSON (import ./cli.nix);
    force = true;
  };
}
