# Local Mistral Vibe provider for DeepSeek Harness

This repository owns the implementation of `@local/dsh-mistral-vibe`. It connects
DSH to Mistral's `/v1/chat/completions` API with a Mistral API / Vibe Code key. It
does not run Vibe CLI, inherit Vibe's tools, or import Vibe's browser login tokens.
The selected key's model access and billing apply; a Vibe subscription alone is
not a guarantee that a particular model is accessible through this API.

## Build and install

```sh
nix build .#dshMistralVibe --out-link result-mistral-vibe
dsh plugin --profile web add "link:$PWD/result-mistral-vibe/share/dsh-mistral-vibe"
dsh --profile web
```

Use your existing profile name instead of `web`. Keep the build's GC root while
the profile uses it. After the dotfiles Home Manager generation is activated,
the package is also available at the stable managed path:

```sh
dsh plugin --profile web add "link:$HOME/.local/share/deepseek-harness/plugins/mistral-vibe"
```

Restart DSH after changing the package. The package manager activates the bundled
`cordis.patch.yml` and registers the `mistral-vibe` route. Use **Settings → Models**
to select **Mistral Vibe** and store the key for `MISTRAL_API_KEY`, or export that
variable in DSH's launching environment. The credential service owns resolution;
a missing named credential never falls back to another reference or account.

Nix supplies the official modules from the same pinned DSH installation. There
are no npm dependencies, install hooks, vendored third-party plugin sources, or
model-catalog downloads. Install the Nix output with `link:`, not a copied tarball:
the output's `node_modules` link supplies DSH's runtime modules. The bare source
directory intentionally does not contain those modules.

## Configuration and scope

The built-in DSH settings schema exposes `apiKeyEnv` (a credential **reference**),
`timeoutMs` (600000 by default), and `models`. The default model is
`mistral-vibe-cli-latest`, with the 262144 context window and `off` / `high`
reasoning levels used by the pinned Vibe 3.1.0 configuration. Its default is `high`.
Model access still depends on the key. Add other models explicitly, for example
in a profile patch:

```yaml
- id: llm-mistral-vibe
  config:
    models:
      - id: mistral-large-4
        name: Mistral Large 4
        reasoningEfforts: [low, medium, high]
        defaultEffort: high
```

Model entries also accept `contextWindow` and `maxTokens`; set verified values
for the selected model. Unknown exact ids remain routable, but no capacities or
reasoning levels are guessed for them. `off` maps to `none`; other configured
levels are sent verbatim. Unsupported selected levels fail before sending.

Supported: text conversations, system prompts, streaming reasoning, parallel
tool calls and tool-result replay, stop sequences, token usage, cancellation,
timeout, and DSH's normal retry policy. Input is explicitly text-only; images and
other unprojected attachments are rejected rather than silently dropped. There
is no account/quota UI, remote settings endpoint, automatic model discovery,
custom gateway URL, or Vibe OAuth integration.

## Trust boundaries and tests

Only `https://api.mistral.ai/v1/chat/completions` receives requests. HTTP redirects
are rejected. Keys are resolved per call and are never stored in source, the Nix
store, logs, or plugin settings. Errors expose status codes, not upstream bodies
that could contain keys or prompts. This does not sandbox other DSH plugins: all
plugins execute with the host's privileges.

The build runs offline tests against the pinned official Cordis and DSH runtime,
including its `AssistantStreamAccumulator` and `BlockAssembler`. Tests cover
split UTF-8/SSE frames, reasoning replay, interleaved tools, id remapping across
turns, malformed/truncated streams, credential misses, HTTP failures, cancellation,
timeout, settings snapshots, registration and disposal. No live requests or real
credentials are used by the test suite.

## References

- [Mistral chat API](https://docs.mistral.ai/api/endpoint/chat)
- [Mistral reasoning and per-model levels](https://docs.mistral.ai/inference/conversations/reasoning)
- [Official Vibe configuration](https://github.com/mistralai/mistral-vibe/blob/v3.1.0/vibe/core/config/vibe_schema.py)
- [Official DSH adapter contract](https://github.com/deepseek-ai/deepseek-harness/blob/v0.2.2-rc.1/packages/llm/llm/src/index.ts)
- [Reference plugin](https://github.com/meltartica/dsh-mistral-vibe/tree/3aaee94cf4472f93892abb480e7144676a407cd3)

The reference was inspected for interoperability, not installed or copied.
This implementation reuses the pinned official modules instead of vendoring
their code.
