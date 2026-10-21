{ writeTextFile }:
let
  fallbackConfig = import ./chains.nix;
in
writeTextFile {
  name = "model-fallback";
  destination = "/model-fallback.js";
  text = ''
    import { createModelFallbackPlugin } from "${./.}/plugin.js"

    export default createModelFallbackPlugin(${builtins.toJSON fallbackConfig})
  '';
}
