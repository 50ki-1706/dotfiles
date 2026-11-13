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

import type { Api } from '@earendil-works/pi-ai'
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy'
import { googleGenerativeAIApi } from '@earendil-works/pi-ai/api/google-generative-ai.lazy'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy'

/** The stream implementation one wire protocol provides. */
export interface Protocol {
  stream: (model: never, context: never, options: never) => AsyncIterable<unknown>
}

/** Every wire protocol a route's `api` may name. */
export const PROTOCOLS: Record<string, () => Protocol> = {
  'openai-completions': openAICompletionsApi as unknown as () => Protocol,
  'openai-responses': openAIResponsesApi as unknown as () => Protocol,
  'anthropic-messages': anthropicMessagesApi as unknown as () => Protocol,
  'google-generative-ai': googleGenerativeAIApi as unknown as () => Protocol,
}

/** The protocol names this build can serve, for diagnostics. */
export const SUPPORTED_PROTOCOLS: readonly string[] = Object.keys(PROTOCOLS)

/** Re-exported so callers do not need the pi-ai type module for a protocol. */
export type ShimApi = Api
