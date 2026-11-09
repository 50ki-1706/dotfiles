{ config, pkgs, ... }:
let
  actions = import ./actions.nix;
  actionDriftMonitor = pkgs.writeTextFile {
    name = "action-drift-monitor";
    destination = "/action-drift-monitor.js";
    text =
      builtins.replaceStrings [ "@BASELINE_ACTIONS@" ] [ (builtins.toJSON actions.monitorActions) ] (
        builtins.readFile ./plugins/action-drift-monitor.js
      )
      + "\n// Resolved from a directory-resident store path.\n";
  };
  modelFallback = pkgs.callPackage ../../packages/opencode-model-fallback { };
  gitSurgeonSkill = "${pkgs.git-surgeon.src}/skills/git-surgeon/SKILL.md";
  prSource = pkgs.fetchFromGitHub {
    owner = "mattpocock";
    repo = "skills";
    rev = "4ae2317ddb22b046e26455e4f9c9b3aaaf62212d";
    hash = "sha256-3vhd77xfZjKUYJsIwPFevIZPUAzUgZXr0RYj5NQrBwk=";
  };
  publishPlugin = pkgs.runCommand "opencode-publish-plugin" { } ''
    mkdir -p "$out"
    cp ${./plugins/publish}/*.ts "$out/"
    rm -f "$out/"*.test.ts
    cp ${./commands/publish.md} "$out/instructions.md"
    cp ${gitSurgeonSkill} "$out/official-skill.md"
    cp ${prSource}/skills/engineering/pr/SKILL.md "$out/pr-skill.md"
  '';
  writingRulesRouter = pkgs.writeTextFile {
    name = "writing-rules-router";
    destination = "/writing-rules-router.js";
    text =
      builtins.replaceStrings [ "@LANGUAGE_RULES@" ] [ (builtins.toJSON (import ./prompts/languages)) ]
        (builtins.readFile ./plugins/writing-rules-router.js);
  };
  # OpenCode 2.0.22 failed to resolve generated bare store-file sources.
  # Keep directory-resident paths; this historical failure does not establish
  # that the current pin has the same limitation. The monitor's appended comment
  # changes its store path to avoid a cached rejection on later activation; it
  # does not prove that a running service will recover.
  pluginSources = {
    "spec-question-guard.js" = ./plugins/spec-question-guard.js;
    "writing-rules-router.js" = "${writingRulesRouter}/writing-rules-router.js";
    "model-fallback.js" = "${modelFallback}/model-fallback.js";
    "action-drift-monitor.js" = "${actionDriftMonitor}/action-drift-monitor.js";
    "nix-verify-gate.js" = ./plugins/nix-verify-gate.js;
    "worktree-removal-guard.js" = ./plugins/worktree-removal-guard.js;
    "publish.ts" = "${publishPlugin}/index.ts";
  };
in
{
  programs.opencode = {
    enable = true;
    package = pkgs.callPackage ../../packages/opencode.nix { };
    settings = import ./opencode.nix { inherit pkgs; };
  };

  home.file =
    pkgs.lib.mapAttrs' (filename: source: {
      name = ".config/opencode/plugins/${filename}";
      value = {
        inherit source;
        force = true;
      };
    }) pluginSources
    // {
      ".config/opencode/skills/git-surgeon/SKILL.md" = {
        source = gitSurgeonSkill;
        force = true;
      };
      ".config/opencode/skills/pr/SKILL.md" = {
        source = "${prSource}/skills/engineering/pr/SKILL.md";
        force = true;
      };
      ".config/opencode/skills/pr/CREDITS.md" = {
        source = "${prSource}/skills/engineering/pr/CREDITS.md";
        force = true;
      };
      ".config/opencode/skills/pr/LICENSE" = {
        source = "${prSource}/LICENSE";
        force = true;
      };
      ".config/opencode/AGENTS.md" = {
        text = builtins.readFile ./AGENTS.md + "\n" + builtins.readFile ./prompts/output-format.md;
        force = true;
      };
      ".config/opencode/cli.json" = {
        source = config.lib.file.mkOutOfStoreSymlink "${config.xdg.stateHome}/cgt/current/opencode.json";
        force = true;
      };
    };
}
