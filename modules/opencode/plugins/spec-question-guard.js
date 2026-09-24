// Spec question guard for the built-in spec agent.
//
// Rules:
// - The latest completed plan_review result is authoritative. Pending,
//   running, or errored review parts never change the gate state.
// - Once any completed plan_review result exists and the latest one starts
//   with "STATUS: COMPLETE", question is denied until a spec message presents
//   the Japanese implementation plan as text-only content.
// - Questions before the first completed review are intentionally allowed.
// - Fail-closed applies only to internal errors and to a completed review
//   whose content cannot be parsed. Permission hooks cannot block or rewrite
//   the plan text itself; they only deny the question call.

// Format contract SHARED with prompts/spec.md. Changing the heading, the
// sections, or the kana thresholds requires changing both files.
const PLAN_HEADING = "## 実装計画"
const PLAN_SECTIONS = ["### 対象範囲", "### 検証方法", "### リスク"]
const KANA_RE = /[\u3040-\u309F\u30A1-\u30FF\u31F0-\u31FF]/g
const MIN_KANA = 30
const KANA_RATIO = 0.05
const COMPLETE_RE = /^STATUS: COMPLETE/m

const ORDER_MESSAGE =
  "順序ガード: plan_review が STATUS: COMPLETE を返した後は、まず実装計画を日本語のテキストのみ" +
  "(ツール呼び出しなし・別メッセージ)で提示してください。冒頭に見出し「## 実装計画」、節" +
  "「### 対象範囲」「### 検証方法」「### リスク」をこの順序で含めてください。質問は計画提示後の" +
  "別のメッセージで行ってください。"
const ERROR_MESSAGE =
  "順序ガードの評価に失敗したため question を一時的に拒否します。実装計画を日本語でテキスト提示" +
  "したことを確認し、必要なら計画を再提示してから再度 question を呼び出してください。"

export default {
  id: "spec-question-guard",
  async setup(ctx) {
    ctx.permission.hook("evaluate", async (event) => {
      try {
        await evaluate(event, ctx)
      } catch (error) {
        deny(event, ERROR_MESSAGE)
        console.warn(`spec question guard failed: ${errorMessage(error)}`)
      }
    })
  },
}

async function evaluate(event, ctx) {
  if (event.action !== "question" || event.agent !== "spec") return

  const messages = await ctx.session.context({ sessionID: event.sessionID })
  const review = latestCompletedReview(messages)
  if (!review) return

  const reviewText = flattenText(review.part.content)
  if (!reviewText) {
    deny(event, ERROR_MESSAGE)
    return
  }
  if (!COMPLETE_RE.test(reviewText)) return

  const presented = messages.some(
    (message, index) => index > review.index && isPresentedPlan(message),
  )
  if (!presented) deny(event, ORDER_MESSAGE)
}

// Returns the message index and tool-part state of the last completed
// plan_review delegation, or null when none exists yet.
function latestCompletedReview(messages) {
  if (!Array.isArray(messages)) return null

  let found = null
  messages.forEach((message, index) => {
    for (const part of message?.content ?? []) {
      if (part?.type !== "tool" || part.name !== "subagent") continue
      const state = part.state
      if (state?.status !== "completed" || state.input?.agent !== "plan_review") continue
      found = { index, part: state }
    }
  })
  return found
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

// A presented plan is a spec text-only message whose heading and sections
// match the shared contract with enough Japanese kana content.
function isPresentedPlan(message) {
  if (message?.agent !== "spec") return false
  const parts = Array.isArray(message.content) ? message.content : []
  if (parts.some((part) => part?.type === "tool")) return false

  const texts = parts.filter((part) => part?.type === "text" && typeof part.text === "string")
  if (texts.length === 0) return false
  const text = texts.map((part) => part.text).join("\n").trim()
  if (!text.startsWith(PLAN_HEADING)) return false

  let cursor = -1
  for (const section of PLAN_SECTIONS) {
    const at = text.indexOf(section)
    if (at <= cursor) return false
    cursor = at
  }

  const kanaCount = (text.match(KANA_RE) ?? []).length
  return kanaCount >= MIN_KANA && kanaCount >= KANA_RATIO * text.length
}

function deny(event, message) {
  event.effect = "deny"
  event.message = message
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}
