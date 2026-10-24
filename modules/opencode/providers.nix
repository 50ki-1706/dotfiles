let
  # 既存プロバイダーはフラットな settings.reasoningEffort、
  # OpenRouter はネストした settings.reasoning.effort を使う。
  mkVariants =
    key: efforts:
    map (e: {
      id = e;
      settings.${key} = if key == "reasoning" then { effort = e; } else e;
    }) efforts;
in
{
  # Catalog metadata from OpenCode v2.1.4's config-free /api/model listing,
  # checked 2026-10-24 with current auth retained. Not an inference test.
  # Empty variant lists preserve catalog variants: Cohere inherits boolean
  # reasoning.enabled none/thinking, not reasoning.effort.
  # OpenCode Zen free
  opencode.models = {
    # Reflection
    "beam-free".variants = mkVariants "reasoningEffort" [
      "low"
      "medium"
      "high"
      "xhigh"
      "max"
    ];
    # Stealth. Zen exposes no reasoning effort variants.
    "big-pickle".variants = [ ];
    # DeepSeek
    "deepseek-v4.1-flash-free".variants = mkVariants "reasoningEffort" [
      "low"
      "high"
      "max"
    ];
    # Recursive
    "flint-40b-free".variants = mkVariants "reasoningEffort" [
      "low"
      "medium"
      "high"
      "xhigh"
      "max"
    ];
    # ZhipuAI
    "glm-5.3-flash-free".variants = mkVariants "reasoningEffort" [
      "low"
      "high"
      "max"
    ];
    # Xiaomi. Zen exposes no reasoning effort variants.
    "mimo-v2.6-flash-free".variants = [ ];
    # NVIDIA. Lightning exposes no reasoning effort variants.
    "nemotron-3.5-lightning-free".variants = [ ];
    "nemotron-3.5-super-vl-free".variants = mkVariants "reasoningEffort" [
      "none"
      "minimal"
      "low"
      "medium"
      "high"
      "xhigh"
    ];
  };
  # OpenAI
  openai.models = {
    "gpt-6.1-sol".variants = mkVariants "reasoningEffort" [
      "low"
      "medium"
      "high"
      "xhigh"
      "max"
    ];
    "gpt-6-luna".variants = mkVariants "reasoningEffort" [
      "none"
      "low"
      "medium"
      "high"
      "xhigh"
      "max"
    ];
  };
  # xAI
  xai.models = {
    "grok-4.7".variants = mkVariants "reasoningEffort" [
      "low"
      "medium"
      "high"
      "xhigh"
    ];
    "grok-build-0.1".variants = [ ];
  };
  # OpenRouter free coding/subagent shortlist.
  # https://openrouter.ai/api/v1/models checked 2026-10-23.
  openrouter.models = {
    # Thinking Machines
    "thinkingmachines/inkling-small:free".variants = mkVariants "reasoning" [
      "none"
      "minimal"
      "low"
      "medium"
      "high"
      "max"
    ];
    # NVIDIA. none も reasoning effort の値として指定する。
    "nvidia/nemotron-3-ultra-550b-a55b:free".variants = mkVariants "reasoning" [
      "none"
      "medium"
      "high"
    ];
    # Recursive
    "recursive/flint-v1.0:free".variants = [ ];
    # Cohere
    "cohere/north-mini-code:free".variants = [ ];
  };
}
