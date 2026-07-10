---
name: owasp-llm-top10
description: Use in LLM integrations/RAG/agent/tool-calling/prompt engineering contexts to apply the OWASP Top 10 for LLM Applications 2025 categories during design, implementation, and review.
---

# OWASP Top 10 for LLM Applications 2025

Use this skill when building, reviewing, or refactoring code that integrates LLMs, retrieval-augmented generation (RAG), agents, tool calling, or prompt engineering. Apply the checks proportionally to the change scope.

## Required Policy

Before treating a task as complete, verify that the change does not weaken security against the OWASP Top 10 for LLM Applications 2025 categories.

1. **Prompt Injection**
   - Treat all user, document, and third-party content as potentially malicious prompts.
   - Separate instructions from data using delimiters, structured formats, or parameterized prompts where feasible.
   - Validate and sanitize retrieved documents and external inputs before including them in prompts.
   - Do not rely solely on prompt instructions to enforce security boundaries.
   - Bad: let untrusted content override instructions or trigger unsafe actions. / Good: separate untrusted content, constrain outputs/tools, use least privilege and human approval.

2. **Sensitive Information Disclosure**
   - Avoid sending secrets, credentials, PII, or proprietary data to LLM providers unless explicitly approved.
   - Redact or mask sensitive data before it enters prompts or training contexts.
   - Review that model outputs are not leaking system prompts, context data, or prior user inputs.
   - Bad: place PII, secrets, or confidential data in prompts/training/output. / Good: mask/sanitize data, restrict access, and keep secrets out of prompts.

3. **Supply Chain**
   - Pin model providers, inference libraries, and embedding services to specific versions or checksums.
   - Verify provenance of models, datasets, and plugins before use.
   - Review permissions and trust boundaries for third-party LLM services and hosted models.
   - Bad: use unverified models, datasets, adapters, plugins, or dependencies. / Good: verify provenance, signatures/hashes, SBOM/AIBOM, licenses, and terms.

4. **Data and Model Poisoning**
   - Validate and sanitize data used for fine-tuning, RAG corpora, or few-shot examples.
   - Control write access to vector stores, knowledge bases, and embedding indexes.
   - Monitor for anomalous inputs that could skew retrieval or model behavior.
   - Bad: ingest untrusted training/fine-tuning/embedding data without checks. / Good: track provenance, validate data, monitor anomalies, red-team, and use trusted sources.

5. **Improper Output Handling**
   - Treat LLM output as untrusted; never execute, render, or pass it to sensitive systems without validation.
   - Apply context-aware encoding before displaying output in HTML, JSON, scripts, or commands.
   - Use structured output schemas and reject malformed or unexpected responses.
   - Bad: send LLM output directly to shell, HTML, SQL, or file paths. / Good: treat output as untrusted and apply validation, contextual encoding, parameterization, and CSP.

6. **Excessive Agency**
   - Grant tools and agents only the minimum permissions they require.
   - Require explicit human confirmation for destructive, irreversible, or high-privilege actions.
   - Log and audit every tool invocation; abort on unexpected or chained behavior.
   - Bad: grant unused tools, broad permissions, or high autonomy to the agent. / Good: minimize tools/functions/permissions and require confirmation for high-impact actions.

7. **System Prompt Leakage**
   - Keep system prompts, instructions, and guardrails out of user-facing contexts.
   - Avoid echoing or summarizing system prompts in responses.
   - Test for prompt-extraction attacks against the integration.
   - Bad: store secrets, permissions, or sensitive controls in the system prompt. / Good: keep secrets outside prompts and enforce controls outside the LLM.

8. **Vector and Embedding Weaknesses**
   - Validate chunks and metadata before ingestion into vector stores.
   - Use access controls on retrieval results so users only receive authorized data.
   - Monitor for adversarial inputs crafted to manipulate embeddings or retrieval ranking.
   - Bad: put RAG data in vector stores without access separation or poisoning checks. / Good: use access-aware stores, trusted sources, classification/tags, monitoring, and hidden-text detection.

9. **Misinformation**
   - Do not present LLM outputs as verified facts without grounding.
   - Cite sources when retrieval is used; allow users to inspect provenance.
   - Design fallback behavior for low-confidence, contradictory, or out-of-scope responses.
   - Bad: trust hallucinated facts, fake packages, or unverified high-impact advice. / Good: ground with trusted sources, verify outputs, use human review, and warn users.

10. **Unbounded Consumption**
    - Enforce quotas, rate limits, and maximum token budgets per request and per user.
    - Set timeouts and payload size limits on LLM calls.
    - Monitor costs and usage anomalies; throttle or circuit-break when thresholds are exceeded.
    - Bad: allow unlimited input, requests, inference, or agent loops. / Good: enforce input limits, rate limits, quotas, timeouts, sandboxing, monitoring, and graceful degradation.

## Reporting

In the final response, state:

- which LLM-specific risk categories were considered for the change;
- any controls added, such as input validation, output encoding, tool permission limits, or quotas;
- any residual risks, such as reliance on third-party models or inability to fully sandbox tool actions;
- the next verification step the user should run, such as a prompt-injection test, dependency audit, or retrieval-access review.

## Sources

1. **Prompt Injection**: https://genai.owasp.org/llmrisk/llm01-prompt-injection/
2. **Sensitive Information Disclosure**: https://genai.owasp.org/llmrisk/llm022025-sensitive-information-disclosure/
3. **Supply Chain**: https://genai.owasp.org/llmrisk/llm032025-supply-chain/
4. **Data and Model Poisoning**: https://genai.owasp.org/llmrisk/llm042025-data-and-model-poisoning/
5. **Improper Output Handling**: https://genai.owasp.org/llmrisk/llm052025-improper-output-handling/
6. **Excessive Agency**: https://genai.owasp.org/llmrisk/llm062025-excessive-agency/
7. **System Prompt Leakage**: https://genai.owasp.org/llmrisk/llm072025-system-prompt-leakage/
8. **Vector and Embedding Weaknesses**: https://genai.owasp.org/llmrisk/llm082025-vector-and-embedding-weaknesses/
9. **Misinformation**: https://genai.owasp.org/llmrisk/llm092025-misinformation/
10. **Unbounded Consumption**: https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/

## Notes

This skill focuses on secure implementation of LLM integrations. It does not replace legal, privacy, or safety reviews for AI deployments. When a change affects model selection, data retention, or user-facing AI behavior, escalate to the appropriate human review.
