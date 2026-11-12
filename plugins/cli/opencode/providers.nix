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
  # OpenCode Zen free. https://opencode.ai/zen/v1/models checked 2026-11-10.
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
    # Stealth. Catalog has no reasoning effort list.
    "iceman-free".variants = [ ];
    # Thinking Machines
    "inkling-2-small-free".variants = mkVariants "reasoningEffort" [
      "none"
      "minimal"
      "low"
      "medium"
      "high"
      "max"
    ];
    # Meituan. Catalog exposes a reasoning toggle, not reasoning.effort.
    "longcat-2.5-free".variants = [ ];
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
  # openai provider, checked 2026-11-10. Efforts match each catalog
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
  # xai provider, checked 2026-11-10. grok-4.7 accepts low, medium, high,
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
  # https://openrouter.ai/api/v1/models checked 2026-11-10.
  openrouter.models = {
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
    # Thinking Machines. Catalog effort list has no "none".
    "thinkingmachines/inkling-2-small:free".variants = mkVariants "reasoning" [
      "minimal"
      "low"
      "medium"
      "high"
      "max"
    ];
  };
  # OpenDesign Cloud (open-design.ai) is absent from the OpenCode catalog, so
  # this entry defines the credential, runtime package, and endpoint itself
  # per https://opencode.ai/docs/providers/#custom. The model plane serves the
  # OpenAI Responses API at amr-link.open-design.ai/v1; the credential is an
  # sk-amr- key issued on the web API keys page, read from OPENDESIGN_API_KEY.
  # Model IDs, names, and token limits mirror the vendor catalog seed
  # (models.mjs of dbydd/opencode-opendesign-auth), checked 2026-11-12. The
  # catalog carries no reasoning effort list, so variants stay empty: the
  # chains.nix validator then reads an empty list instead of a missing
  # attribute if a chain ever references opendesign/#variant.
  # The vendor plugin signs in to the same opendesign ID; a config-defined
  # provider keeps the ID and lists the plugin's provider as
  # opendesign-plugin (its README documents that precedence).
  opendesign = {
    name = "OpenDesign";
    env = [ "OPENDESIGN_API_KEY" ];
    package = "@opencode/ai/providers/openai-compatible/responses";
    settings.baseURL = "https://amr-link.open-design.ai/v1";
    models = {
      "claude-haiku-5.5" = {
        name = "Claude Haiku 5.5";
        variants = [ ];
        limit.context = 1000000;
        limit.output = 132000;
      };
      "deepseek-v4-flash" = {
        name = "DeepSeek V4 Flash";
        variants = [ ];
        limit.context = 1048000;
        limit.output = 232000;
      };
      "deepseek-v4-flash-vision-exp" = {
        name = "DeepSeek V4 Flash Vision (exp)";
        variants = [ ];
        limit.context = 1048000;
        limit.output = 232000;
      };
      "deepseek-v4-pro" = {
        name = "DeepSeek V4 Pro";
        variants = [ ];
        limit.context = 1048000;
        limit.output = 232000;
      };
      "deepseek-v4.1-flash" = {
        name = "DeepSeek V4.1 Flash";
        variants = [ ];
        limit.context = 1048000;
        limit.output = 232000;
      };
      "glm-5.3-flash" = {
        name = "GLM 5.3 Flash";
        variants = [ ];
        limit.context = 1048000;
        limit.output = 232000;
      };
      "glm-5.3-flashx" = {
        name = "GLM 5.3 FlashX";
        variants = [ ];
        limit.context = 1000000;
        limit.output = 232000;
      };
      "gpt-6-luna" = {
        name = "GPT-6 Luna";
        variants = [ ];
        limit.context = 1050000;
        limit.output = 304000;
      };
      "kimi-k2.7-code" = {
        name = "Kimi K2.7 Code";
        variants = [ ];
        limit.context = 262000;
        limit.output = 262000;
      };
      "mimo-v2.6-flash" = {
        name = "MiMo V2.6 Flash";
        variants = [ ];
        limit.context = 1048000;
        limit.output = 232000;
      };
      "mimo-v2.6-pro" = {
        name = "MiMo V2.6 Pro";
        variants = [ ];
        limit.context = 1048000;
        limit.output = 232000;
      };
    };
  };
}
