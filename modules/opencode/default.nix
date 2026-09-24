{ pkgs, ... }:
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
}
