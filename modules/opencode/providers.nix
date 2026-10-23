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
  # OpenAI
  openai.models = {
    "gpt-6.1-sol".variants = mkVariants "reasoningEffort" [
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
  # xAI
  xai.models = {
    "grok-4.7".variants = mkVariants "reasoningEffort" [
      "none"
      "low"
      "medium"
      "high"
      "xhigh"
    ];
    "grok-build-0.1".variants = mkVariants "reasoningEffort" [ ];
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
    # Recursive. 固定中の 2.0.22 snapshot はメタデータ未収載のため、既定の
    # text+image, 200k/32k を明示値で補う。variants=[] は fallback の自動生成だけを
    # 防ぎ、後でカタログが更新された場合の variants は保持する。
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
