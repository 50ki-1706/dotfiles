let
  # 各モデルの reasoningEffort バリアントを簡潔に定義するヘルパー。
  mkVariants =
    efforts:
    map (e: {
      id = e;
      settings.reasoningEffort = e;
    }) efforts;
in
{
  # OpenCode Zen free
  opencode.models = {
    # Reflection
    "beam-free".variants = mkVariants [
      "low"
      "medium"
      "high"
      "xhigh"
      "max"
    ];
    # Stealth. Zen exposes no reasoning effort variants.
    "big-pickle".variants = [ ];
    # DeepSeek
    "deepseek-v4.1-flash-free".variants = mkVariants [
      "low"
      "high"
      "max"
    ];
    # ZhipuAI
    "glm-5.3-flash-free".variants = mkVariants [
      "low"
      "high"
      "max"
    ];
    # TypeSafe. No catalog data on reasoning efforts.
    "jev-1.13-free".variants = [ ];
    # Meituan. Zen exposes a reasoning toggle, not effort values.
    "longcat-2.5-preview-free".variants = [ ];
    # Xiaomi. Zen exposes no reasoning effort variants.
    "mimo-v2.6-flash-free".variants = [ ];
    # MiniMax
    "minimax-m3.1-flash-free".variants = mkVariants [
      "low"
      "medium"
      "high"
      "xhigh"
      "max"
    ];
    # NVIDIA. Lightning exposes no reasoning effort variants.
    "nemotron-3.5-lightning-free".variants = [ ];
    "nemotron-3.5-super-vl-free".variants = mkVariants [
      "none"
      "minimal"
      "low"
      "medium"
      "high"
      "xhigh"
    ];
  };
  # OpenCode Go
  opencode-go.models = {
    "deepseek-v4.1-flash".variants = mkVariants [
      "low"
      "high"
      "max"
    ];
    "glm-5.3-flash".variants = mkVariants [
      "low"
      "high"
      "max"
    ];
    # OpenCode Go currently exposes no reasoning effort variants for MiMo v2.6.
    "mimo-v2.6-flash".variants = [ ];
    "mimo-v2.6-pro".variants = [ ];
    "qwen3.8-flash".variants = mkVariants [
      "low"
      "medium"
      "xhigh"
    ];
  };

  # OpenAI
  openai.models = {
    "gpt-6.1-sol".variants = mkVariants [
      "none"
      "low"
      "medium"
      "high"
      "xhigh"
      "max"
    ];
    "gpt-6-luna".variants = mkVariants [
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
    "grok-4.7".variants = mkVariants [
      "none"
      "low"
      "medium"
      "high"
      "xhigh"
    ];
    "grok-build-0.1".variants = mkVariants [ ];
  };
}
