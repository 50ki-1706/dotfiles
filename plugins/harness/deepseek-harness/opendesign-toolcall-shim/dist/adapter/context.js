/**
 * Projecting a harness request into pi-ai's context vocabulary.
 *
 * The stock adapter converts through `@deepseek-ai/dsh-llm-pi-ai/src/context.ts`.
 * That module is a TypeScript source inside `node_modules`, and the desktop app
 * ships the package that way (`src/*.ts` beside `lib/index.js`), so Node refuses
 * to load it: `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`. Importing it fails
 * the whole bundle, which is why this projection exists.
 *
 * The rules below are the stock ones, restated:
 *
 * - `options.system` and the leading `system` messages become pi-ai's
 *   `systemPrompt` slot.
 * - A later `system` message becomes an in-history system message when the
 *   protocol takes one, and a `<system-reminder>` user turn when it does not.
 * - A `developer` message becomes a system message carrying its text and any
 *   tool additions or removals it projects.
 * - Assistant turns replay as text plus `toolCall` blocks; tool results become
 *   `toolResult` messages named after the call they answer.
 * - Images are resolved through the attachment seam into base64 blocks, with
 *   the route's pixel and byte budgets applied.
 *
 * @module dsh-opendesign-toolcall-shim/adapter/context
 */
import { LlmError } from '@deepseek-ai/dsh-llm';
/** Join the text blocks of one message. */
function flattenText(message) {
    return message.content
        .filter((block) => block.type === 'text')
        .map(block => block.text)
        .join('');
}
/** Whether any block of one message is an image. */
function hasImage(content) {
    return content.some(block => block.type === 'image');
}
/** Reject shapes pi-ai cannot represent before any conversion happens. */
function assertSupportedHistory(messages) {
    for (const message of messages) {
        if (message.role !== 'developer' && message.content.some(block => block.type === 'tool-addition' || block.type === 'tool-removal')) {
            throw new LlmError('Tool-change blocks require developer role', 'UNSUPPORTED_CONTENT');
        }
        if (message.role !== 'user' && message.role !== 'tool' && hasImage(message.content)) {
            throw new LlmError(`pi-ai cannot represent an image in an in-history ${message.role} message`, 'UNSUPPORTED_CONTENT');
        }
        if (message.role === 'system' && message.content.some(block => block.type !== 'text')) {
            throw new LlmError('pi-ai cannot represent non-text system messages', 'UNSUPPORTED_CONTENT');
        }
    }
}
/** Convert a projected tool declaration without its harness-owned marker. */
function piTool(tool) {
    return { name: tool.name, description: tool.description, parameters: tool.parameters };
}
/** The tools this request offers pi-ai. */
function toolsOf(options) {
    return options.tools?.filter(tool => !tool.deferLoading).map(piTool);
}
/** Combine request-level text and leading system history into the initial prompt. */
function splitSystemPrompt(options) {
    const text = [options.system];
    let end = 0;
    for (const message of options.messages) {
        if (message.role !== 'system')
            break;
        text.push(flattenText(message));
        end += 1;
    }
    const systemPrompt = text.filter((part) => part !== undefined && part.length > 0).join('\n\n');
    return { systemPrompt: systemPrompt.length > 0 ? systemPrompt : undefined, messages: options.messages.slice(end) };
}
/** Assemble the pi-ai context envelope both conversion paths share. */
function piContext(systemPrompt, options, messages) {
    const tools = toolsOf(options);
    return {
        ...systemPrompt === undefined ? {} : { systemPrompt },
        messages,
        ...tools === undefined || tools.length === 0 ? {} : { tools },
    };
}
/** The user content blocks of one message, with images resolved. */
async function userContent(blocks, images) {
    const content = [];
    for (const block of blocks) {
        switch (block.type) {
            case 'text':
                if (block.text.length > 0)
                    content.push({ type: 'text', text: block.text });
                break;
            case 'image': {
                if (images === undefined) {
                    throw new LlmError('pi-ai image conversion requires the durable attachment service', 'UNSUPPORTED_CONTENT');
                }
                const version = await images.readRequestImage(block.attachment, images.requestImagePolicy);
                if (version === undefined) {
                    throw new LlmError('pi-ai could not read a request image from the attachment service', 'UNSUPPORTED_CONTENT');
                }
                content.push({ type: 'text', text: `[image ${block.attachment.attachmentId}]` });
                content.push({
                    type: 'image',
                    data: Buffer.from(version.bytes).toString('base64'),
                    mimeType: version.mediaType,
                });
                break;
            }
            default:
                // Other merge-extensible blocks are not user-input vocabulary for pi-ai.
                break;
        }
    }
    if (content.every(block => block.type === 'text'))
        return content.map(block => block.text).join('');
    return content;
}
/** Recover the pi-ai tool-result message for one harness tool message. */
async function toolResultOf(message, toolNames, images) {
    const content = await userContent(message.content, images);
    return {
        role: 'toolResult',
        toolCallId: message.toolCallId,
        toolName: toolNames.get(String(message.toolCallId)) ?? 'unknown',
        content: typeof content === 'string'
            ? [{ type: 'text', text: content.length > 0 ? content : '(no output)' }]
            : content,
        isError: message.isError ?? false,
        timestamp: 0,
    };
}
/** Keep one developer event in one system update, resolving its tool declarations. */
function appendDeveloper(message, options, messages) {
    const content = [];
    const toolsAdded = [];
    const toolsRemoved = [];
    for (const block of message.content) {
        switch (block.type) {
            case 'text':
                if (block.text.length > 0)
                    content.push({ type: 'text', text: block.text });
                break;
            case 'tool-addition': {
                const tool = options.tools?.find(candidate => candidate.name === block.toolName);
                if (tool === undefined) {
                    throw new LlmError(`pi-ai tool update references undeclared tool "${block.toolName}"`, 'INVALID_REQUEST');
                }
                toolsAdded.push(piTool(tool));
                break;
            }
            case 'tool-removal':
                toolsRemoved.push({ name: block.toolName });
                break;
            default:
                throw new LlmError(`pi-ai cannot represent developer content ${block.type}`, 'UNSUPPORTED_CONTENT');
        }
    }
    if (content.length === 0 && toolsAdded.length === 0 && toolsRemoved.length === 0)
        return;
    const update = {
        role: 'system',
        content,
        timestamp: 0,
        ...toolsAdded.length === 0 ? {} : { toolsAdded },
        ...toolsRemoved.length === 0 ? {} : { toolsRemoved },
    };
    messages.push(update);
}
/**
 * Replay one assistant turn as pi-ai's assistant message.
 *
 * The durable replay envelope the stock adapter attaches is not reproduced:
 * it records provider response identity for the next request, and pi-ai treats
 * its absence as "no replay state", which is the same path a first request
 * takes.
 */
function appendAssistant(message, messages, toolNames, provider, model) {
    const content = [];
    for (const block of message.content) {
        switch (block.type) {
            case 'text':
                if (block.text.length > 0)
                    content.push({ type: 'text', text: block.text });
                break;
            case 'tool-call': {
                const id = String(block.id);
                toolNames.set(id, block.name);
                content.push({
                    type: 'toolCall',
                    id,
                    name: block.name,
                    arguments: parseArguments(block.arguments),
                });
                break;
            }
            default:
                break;
        }
    }
    const toolCalls = content.some(block => block.type === 'toolCall');
    messages.push({
        role: 'assistant',
        content,
        api: 'openai-completions',
        provider,
        model,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
        stopReason: toolCalls ? 'toolUse' : 'stop',
        timestamp: 0,
    });
}
/** Parse one replayed call's stored arguments. */
function parseArguments(text) {
    try {
        const parsed = JSON.parse(text);
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
            ? parsed
            : {};
    }
    catch {
        return {};
    }
}
/**
 * Project one harness request into a pi-ai context.
 * @param options - the harness call options.
 * @param profile - the resolved route profile.
 * @param images - the attachment seam, when the call carries an image.
 * @returns the pi-ai context.
 * @throws {LlmError} `UNSUPPORTED_CONTENT` for a shape pi-ai cannot represent.
 */
export async function projectContext(options, profile, images) {
    assertSupportedHistory(options.messages);
    const split = splitSystemPrompt(options);
    if (images === undefined && split.messages.some(message => hasImage(message.content))) {
        throw new LlmError('pi-ai image conversion requires the durable attachment service', 'UNSUPPORTED_CONTENT');
    }
    const toolNames = new Map();
    const messages = [];
    for (const message of split.messages) {
        switch (message.role) {
            case 'developer':
                appendDeveloper(message, options, messages);
                continue;
            case 'system': {
                const content = flattenText(message);
                if (content.length > 0) {
                    messages.push({ role: 'system', content, timestamp: 0 });
                }
                continue;
            }
            case 'assistant':
                appendAssistant(message, messages, toolNames, profile.provider, options.model);
                continue;
            case 'tool':
                messages.push(await toolResultOf(message, toolNames, images));
                continue;
            default: {
                const content = await userContent(message.content, images);
                messages.push({ role: 'user', content, timestamp: 0 });
            }
        }
    }
    return piContext(split.systemPrompt, options, messages);
}
