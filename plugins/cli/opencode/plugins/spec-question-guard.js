// Present a reviewed plan before continuing; never wait for user approval.
// This guards the interval between a successful foreground "Plan review:"
// delegation and its visible plan. It is not a semantic implementation detector:
// initial evidence gathering, final implementation reviews and unrelated agents
// are unaffected. Prompt instructions own review-before-implementation routing.
// Context compaction may remove evidence; no stale state is retained separately.

// Format contract SHARED with prompts/spec.md. Changing the heading, the
// sections, or review description prefix requires changing both files.
const PLAN_HEADING = "## 実装計画"
const PLAN_SECTIONS = ["### 対象範囲", "### 検証方法", "### リスク"]
const PLAN_SECTION_RE = new RegExp(`^(?:${PLAN_SECTIONS.join("|")})\\s*$`, "gm")
const PLAN_REVIEW_PREFIX = "Plan review:"
const STATUS_RE = /^STATUS: (COMPLETE|PARTIAL|INPROGRESS|FAILED|BLOCKED)(?:\r?\n|$)/
const GUARDED_ACTIONS = new Set(["question", "edit", "shell"])

const ORDER_MESSAGE =
  "順序ガード: plan_review が STATUS: COMPLETE を返した後は、同じ応答の最初のツール呼び出しより" +
  "前に実装計画を日本語の本文で提示してください。冒頭に見出し「## 実装計画」、節" +
  "「### 対象範囲」「### 検証方法」「### リスク」をこの順序で、内容を付けて含めてください。" +
  "計画を提示したら、承認や Y の返答を待たずに実装へ進んでください。"
const ERROR_MESSAGE =
  "順序ガードの評価に失敗したため、この操作を一時的に拒否します。Plan review: のレビュー結果と" +
  "日本語の実装計画の提示を確認してください。計画のユーザー承認は不要です。"

export default {
  id: "spec-question-guard",
  async setup(ctx) {
    ctx.permission.hook("evaluate", async (event) => {
      if (!isGuarded(event)) return
      try {
        const messages = await ctx.session.context({ sessionID: event.sessionID })
        const message = presentationError(messages)
        if (message) deny(event, message)
      } catch (error) {
        deny(event, ERROR_MESSAGE)
        console.warn(`spec question guard failed: ${errorMessage(error)}`)
      }
    })
  },
}

function presentationError(messages) {
  if (!Array.isArray(messages)) throw new Error("session context must be an array")
  // TODO(review-enforcement): Track required review and successful completion,
  // including across compaction, instead of relying on the spec prompt for them.
  // Preserve pre-plan evidence gathering when adding this enforcement.
  const review = latestCompletedPlanReview(messages)
  if (!review) return

  const status = reviewStatus(review.content)
  if (!status) return ERROR_MESSAGE
  if (status !== "COMPLETE") return

  if (!messages.slice(review.index + 1).some(isPresentedPlan)) return ORDER_MESSAGE
}

function isGuarded(event) {
  if (event.agent !== "spec") return false
  return GUARDED_ACTIONS.has(event.action) ||
    (event.action === "subagent" && event.resources?.includes("general"))
}

// Scan newest first and stop at the current request's user message.
function latestCompletedPlanReview(messages) {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message?.type === "user") return
    if (message?.type !== "assistant" || message.agent !== "spec") continue
    const part = (message.content ?? []).findLast(isCompletedPlanReview)
    if (part) return { index, content: part.state.content }
  }
}

// Exclude implementation/design reviews and completed launches of running jobs.
function isCompletedPlanReview(part) {
  return part?.type === "tool" && part.name === "subagent" &&
    part.state?.status === "completed" && part.state.input?.agent === "plan_review" &&
    part.state.input.description?.startsWith(PLAN_REVIEW_PREFIX) &&
    part.state.metadata?.status !== "running"
}

function reviewStatus(content) {
  return flattenText(content)
    .replace(/^<subagent\b[^>]*>\s*/, "")
    .replace(/\s*<\/subagent>$/, "")
    .trim()
    .match(STATUS_RE)?.[1]
}

function flattenText(content) {
  if (!Array.isArray(content)) return ""
  const texts = []
  for (const item of content) {
    if (typeof item === "string") texts.push(item)
    else if (typeof item?.text === "string") texts.push(item.text)
  }
  return texts.join("\n").trim()
}

// OpenCode ends a no-tool response instead of requesting another model step.
// Accept the visible plan BEFORE the first tool in the current assistant record:
// v2 publishes text and the pending tool before permission evaluation. Also accept
// a prior plan-only record for resumed sessions. Text after a tool is too late.
// Do not reject concise plans using arbitrary kana counts or length ratios.
function isPresentedPlan(message) {
  if (message?.type !== "assistant" || message.agent !== "spec") return false
  const parts = Array.isArray(message.content) ? message.content : []
  const firstTool = parts.findIndex((part) => part?.type === "tool")
  const visibleBeforeTool = firstTool < 0 ? parts : parts.slice(0, firstTool)

  const text = flattenText(visibleBeforeTool.filter((part) => part?.type === "text"))
  if (!text.startsWith(`${PLAN_HEADING}\n`)) return false

  const sections = [...text.matchAll(PLAN_SECTION_RE)]
  if (sections.length !== PLAN_SECTIONS.length) return false
  for (const [index, section] of sections.entries()) {
    if (section[0].trim() !== PLAN_SECTIONS[index]) return false
    const end = sections[index + 1]?.index ?? text.length
    if (!text.slice(section.index + section[0].length, end).trim()) return false
  }
  return true
}

function deny(event, message) {
  event.effect = "deny"
  event.message = message
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}
