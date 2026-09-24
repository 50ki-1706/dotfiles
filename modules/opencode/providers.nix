{
  opencode-go.models."deepseek-v4.1-flash".variants = [
    {
      id = "low";
      settings.reasoningEffort = "low";
    }
    {
      id = "high";
      settings.reasoningEffort = "high";
    }
    {
      id = "max";
      settings.reasoningEffort = "max";
    }
  ];
  opencode-go.models."glm-5.3-flash".variants = [
    {
      id = "low";
      settings.reasoningEffort = "low";
    }
    {
      id = "high";
      settings.reasoningEffort = "high";
    }
    {
      id = "max";
      settings.reasoningEffort = "max";
    }
  ];
  # OpenCode Go currently exposes no reasoning effort variants for MiMo v2.6.
  opencode-go.models."mimo-v2.6-flash".variants = [ ];
  opencode-go.models."mimo-v2.6-pro".variants = [ ];
  opencode-go.models."qwen3.8-flash".variants = [
    {
      id = "low";
      settings.reasoningEffort = "low";
    }
    {
      id = "medium";
      settings.reasoningEffort = "medium";
    }
    {
      id = "xhigh";
      settings.reasoningEffort = "xhigh";
    }
  ];
  openai.models."gpt-6-luna".variants = [
    {
      id = "none";
      settings.reasoningEffort = "none";
    }
    {
      id = "low";
      settings.reasoningEffort = "low";
    }
    {
      id = "medium";
      settings.reasoningEffort = "medium";
    }
    {
      id = "high";
      settings.reasoningEffort = "high";
    }
    {
      id = "xhigh";
      settings.reasoningEffort = "xhigh";
    }
    {
      id = "max";
      settings.reasoningEffort = "max";
    }
  ];
}
