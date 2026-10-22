{ pkgs, ... }:
let
  actions = import ./actions.nix;
  baselineActions =
    actions.coreActions
    ++ actions.opencodeActions
    ++ actions.mcpToolActions.graphify
    ++ actions.mcpToolActions.chromeDevtools
    ++ actions.mcpToolActions.figma;
  actionDriftMonitor = pkgs.writeTextFile {
    name = "action-drift-monitor";
    destination = "/action-drift-monitor.js";
    text =
      builtins.replaceStrings [ "@BASELINE_ACTIONS@" ] [ (builtins.toJSON baselineActions) ] (
        builtins.readFile ./plugins/action-drift-monitor.js
      )
      + "\n// Resolved from a directory-resident store path.\n";
  };
  modelFallback = pkgs.callPackage ../../packages/opencode-model-fallback { };
in
{
  programs.opencode = {
    enable = true;
    package = pkgs.callPackage ../../packages/opencode.nix { };
    settings = import ./opencode.nix { inherit pkgs; };
  };

  home.file.".config/opencode/AGENTS.md" = {
    text = builtins.readFile ./AGENTS.md + "\n" + builtins.readFile ./prompts/output-format.md;
    force = true;
  };
  home.file.".config/opencode/plugins/spec-question-guard.js" = {
    source = ./plugins/spec-question-guard.js;
    force = true;
  };
  # Keep generated plugins directory-resident; OpenCode 2.0.22 cannot resolve a bare store-file source.
  home.file.".config/opencode/plugins/model-fallback.js" = {
    source = "${modelFallback}/model-fallback.js";
    force = true;
  };
  # Do not use `home.file.text`: Home Manager emits a bare /nix/store/<hash>-*.js
  # object, which the running OpenCode 2.0.22 service fails to resolve.
  # The trailing generated comment is intentional: a later activation is not
  # guaranteed to reuse the cached rejection. It does not prove the running
  # service will recover.
  home.file.".config/opencode/plugins/action-drift-monitor.js" = {
    source = "${actionDriftMonitor}/action-drift-monitor.js";
    force = true;
  };
  home.file.".config/opencode/plugins/nix-verify-gate.js" = {
    source = ./plugins/nix-verify-gate.js;
    force = true;
  };
  home.file.".config/opencode/cli.json" = {
    text = builtins.toJSON (import ./cli.nix);
    force = true;
  };
}
