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
    # TypeSafe. No catalog data on reasoning efforts.
    "jev-1.13-free".variants = [ ];
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
  # openai provider, checked 2026-10-28. Efforts match each catalog
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
  # xai provider, checked 2026-10-28. grok-4.7 accepts low, medium, high,
  # and xhigh. "none" is not a supported effort.
  xai.models = {
    "grok-4.7".variants = mkVariants "reasoningEffort" [
      "low"
      "medium"
      "high"
      "xhigh"
    ];
    "grok-build-0.1".variants = mkVariants "reasoningEffort" [ ];
  };
  # OpenRouter free coding/subagent shortlist.
  # https://openrouter.ai/api/v1/models checked 2026-10-28.
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
    # Recursive. models.dev と固定中の 2.1.4 snapshot は text、262144/235929 で
    # reasoning effort なし。明示 limit はその値に合わせ、古い text+image 200k/32k
    # 既定へ戻さない。variants=[] は effort バリアントを作らない。
    "recursive/flint-v1.0:free" = {
      limit = {
        context = 262144;
        output = 235929;
      };
      capabilities.input = [ "text" ];
      variants = [ ];
    };
    # Cohere
    "cohere/north-mini-code:free".variants = [ ];
  };
}
