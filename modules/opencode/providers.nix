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
  # StepFun (OpenCode Zen free)
  opencode.models = {
    "step-5-preview-free".variants = mkVariants [
      "low"
      "medium"
      "high"
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
    "grok-build-0.1".variants = mkVariants []; 
  };
}
