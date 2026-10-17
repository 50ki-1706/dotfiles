let
  agentModels = (import ../../modules/opencode/agents.nix).agents;
  fallbackLists = {
    spec = [
      "opencode/glm-5.3-flash-free#high"
      "opencode/deepseek-v4.1-flash-free#high"
      "openai/gpt-6.1-sol#high"
    ];
    general = [
      "opencode/deepseek-v4.1-flash-free#max"
      "xai/grok-build-0.1"
    ];
    explore = [
      "opencode/deepseek-v4.1-flash-free#high"
      "opencode/mimo-v2.6-flash-free"
      "openai/gpt-6-luna#high"
    ];
    plan_review = [
      "opencode/glm-5.3-flash-free#max"
      "opencode/deepseek-v4.1-flash-free#max"
      "opencode/mimo-v2.6-flash-free"
    ];
  };
  threshold = 3;
  modelPattern = "^(openai|xai|opencode)/[A-Za-z0-9._-]+(#[A-Za-z0-9._-]+)?$";
  canonicalModel = model: builtins.replaceStrings [ "#default" ] [ "" ] model;
  unique =
    values:
    builtins.length values == builtins.length (
      builtins.attrNames (
        builtins.listToAttrs (
          map (value: {
            name = canonicalModel value;
            value = true;
          }) values
        )
      )
    );
  validModel = model: builtins.isString model && builtins.match modelPattern model != null;
  validAgent =
    name:
    let
      models = fallbackLists.${name};
      primary = agentModels.${name}.model;
    in
    builtins.isList models
    && builtins.length models <= 3
    && unique models
    && !(builtins.elem (canonicalModel primary) (map canonicalModel models))
    && builtins.all validModel models;
in
assert builtins.all validAgent (builtins.attrNames fallbackLists);
{
  inherit threshold;
  agents = builtins.mapAttrs (name: fallbacks: {
    primary = agentModels.${name}.model;
    inherit fallbacks;
  }) fallbackLists;
}
