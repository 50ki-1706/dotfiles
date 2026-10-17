{ writeTextFile }:
let
  fallbackConfig = import ./chains.nix;
in
writeTextFile {
  name = "model-fallback";
  destination = "/model-fallback.js";
  text =
    builtins.replaceStrings
      [ "@POLICY_SOURCE@" "@FALLBACK_CONFIG@" ]
      [
        (builtins.readFile ./policy.js)
        (builtins.toJSON (builtins.removeAttrs fallbackConfig [ "validate" ]))
      ]
      (builtins.readFile ./plugin.js)
    + "\n// Generated from the fallback policy and validated Nix configuration.\n";
}
