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
  # OpenCode Zen free. https://opencode.ai/zen/v1/models checked 2026-10-31.
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
  # OpenAI featured models.
  # https://platform.openai.com/docs/models and https://models.dev/api.json
  # openai provider, checked 2026-10-31. Efforts match each catalog
  # reasoning_options effort list.
  openai.models = {
    "gpt-6-astra".variants = mkVariants "reasoningEffort" [
      "low"
      "medium"
      "high"
      "xhigh"
      "max"
    ];
    "gpt-6.1-sol".variants = mkVariants "reasoningEffort" [
      "low"
      "medium"
      "high"
      "xhigh"
      "max"
    ];
    "gpt-6.1-terra".variants = mkVariants "reasoningEffort" [
      "none"
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
  # xAI. https://docs.x.ai/docs/models and https://models.dev/api.json
  # xai provider, checked 2026-10-31. grok-4.7 accepts low, medium, high,
  # and xhigh. "none" is not a supported effort.
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
  # https://openrouter.ai/api/v1/models checked 2026-10-31.
  openrouter.models = {
    # Thinking Machines. Full Inkling (41B active / 975B), same effort ladder.
    "thinkingmachines/inkling:free".variants = mkVariants "reasoning" [
      "none"
      "minimal"
      "low"
      "medium"
      "high"
      "max"
    ];
    # Thinking Machines. Smaller, more efficient sibling (12B active / 276B).
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
    # NVIDIA. Nemotron 3.5 Super VL (12B active / 120B), 1M context,
    # tools, and visual/agentic reasoning. models.dev has no effort list.
    "nvidia/nemotron-3.5-super-vl:free".variants = [ ];
    # Recursive
    "recursive/flint-v1.0:free".variants = [ ];
    # Cohere
    "cohere/north-mini-code:free".variants = [ ];
    # Poolside. Laguna S 2.1 coding agent (8B active / 118B), 70.2% on
    # Terminal-Bench 2.1, 262k context, tools. models.dev has no effort list.
    "poolside/laguna-s-2.1:free".variants = [ ];
  };
}
