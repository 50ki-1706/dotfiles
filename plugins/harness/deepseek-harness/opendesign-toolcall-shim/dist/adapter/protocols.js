/**
 * The pi-ai protocol implementations a route may name.
 *
 * pi-ai ships each wire protocol behind its own narrow entry point, so a route
 * only loads the protocol it speaks. The stock resolver keeps the same table;
 * the shim restates it because the stock module is a TypeScript source inside
 * `node_modules` that the desktop app's Node refuses to load.
 *
 * @module dsh-opendesign-toolcall-shim/adapter/protocols
 */
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy';
import { googleGenerativeAIApi } from '@earendil-works/pi-ai/api/google-generative-ai.lazy';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy';
/** Every wire protocol a route's `api` may name. */
export const PROTOCOLS = {
    'openai-completions': openAICompletionsApi,
    'openai-responses': openAIResponsesApi,
    'anthropic-messages': anthropicMessagesApi,
    'google-generative-ai': googleGenerativeAIApi,
};
/** The protocol names this build can serve, for diagnostics. */
export const SUPPORTED_PROTOCOLS = Object.keys(PROTOCOLS);
