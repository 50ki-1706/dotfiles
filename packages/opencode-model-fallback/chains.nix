let
  agentConfig = import ../../modules/opencode/agents.nix;
  agentModels = agentConfig.agents;
  # Account budgets, shared across each provider's free models:
  # OpenRouter: 1,000 requests/day, 20/minute; Zen: 200 requests/day.
  # Only general/explore start on Zen; spec/review use it only as a late fallback.
  # Each model step, including tool-result continuations, consumes another request.
  # Keep spec on Sol for Japanese dialogue and review on a separate OpenRouter model.
  # Workers try OpenRouter free models before OpenAI, which carries work after free caps.
  # Three distinct fallback models cover model-specific outages; shared caps remain shared.
  # Reserve xAI for the final review fallback to leave capacity for grokbot.
  fallbackLists = {
    spec = [
      "openrouter/thinkingmachines/inkling:free#high"
      "openrouter/recursive/flint-v1.0:free"
      "opencode/beam-free#max"
    ];
    general = [
      "openrouter/recursive/flint-v1.0:free"
      "openrouter/cohere/north-mini-code:free"
      "openai/gpt-6.1-sol#high"
    ];
    explore = [
      "openrouter/thinkingmachines/inkling:free#high"
      "openrouter/cohere/north-mini-code:free"
      "openai/gpt-6-luna#high"
    ];
    plan_review = [
      "openai/gpt-6-luna#max"
      "opencode/glm-5.3-flash-free#max"
      "xai/grok-4.7#high"
    ];
  };
  threshold = 3;
  # Split at the first slash so OpenRouter's vendor/model:free IDs remain intact.
  modelPattern = "^([^/]+)/([^#]+)(#([^#]+))?$";
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
  validModel =
    model:
    let
      parts = if builtins.isString model then builtins.match modelPattern model else null;
      provider = builtins.elemAt parts 0;
      id = builtins.elemAt parts 1;
      variant = builtins.elemAt parts 3;
      configuredModel = agentConfig.providers.${provider}.models.${id} or null;
    in
    parts != null
    && configuredModel != null
    && (
      variant == null
      || variant == "default"
      || builtins.any (entry: entry.id == variant) configuredModel.variants
    );
  validAgent =
    name:
    let
      models = fallbackLists.${name};
      primary = agentModels.${name}.model;
    in
    builtins.isList models
    && validModel primary
    && builtins.length models <= 3
    && unique models
    && !(builtins.elem (canonicalModel primary) (map canonicalModel models))
    && builtins.all validModel models;
  baseModel = model: builtins.head (builtins.split "#" model);
  specModels = map baseModel ([ agentModels.spec.model ] ++ fallbackLists.spec);
  reviewModels = map baseModel ([ agentModels.plan_review.model ] ++ fallbackLists.plan_review);
in
assert builtins.all validAgent (builtins.attrNames fallbackLists);
# Changing reasoning effort alone does not provide an independent review model.
assert builtins.all (model: !(builtins.elem model specModels)) reviewModels;
{
  inherit threshold;
  agents = builtins.mapAttrs (name: fallbacks: {
    primary = agentModels.${name}.model;
    inherit fallbacks;
  }) fallbackLists;
}
