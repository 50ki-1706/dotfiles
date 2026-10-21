const COMMUNICATION_FAILURES = new Set([
  "provider.transport",
  "provider.timeout",
  "provider.internal",
  "provider.rate-limit",
])

const QUOTA_ERROR_CODES = new Set(
  [
    // API billing caps and subscription limits.
    "insufficient_quota",
    "credit_balance_exhausted",
    "billing_hard_limit_reached",
    "organization_spend_limit_exceeded",
    "project_spend_limit_exceeded",
    "organization_usage_limit_exceeded",
    "usage_limit_reached",
    "usage_limit_exceeded",
    "subscription_sharing_usage_limit_exceeded",
    "billing_error",
    "usage_not_included",
    // Zen account caps, including free models.
    "CreditsError",
    "MonthlyLimitError",
    "UserLimitError",
    "FreeUsageLimitError",
    "GoUsageLimitError",
    "BlackUsageLimitError",
    "CreditLimitExceeded",
  ].map((code) => code.toLowerCase()),
)

const QUOTA_MESSAGE_PATTERNS = [
  /spending-limit|run out of credits/i,
  /\bexceeded your current quota\b/i,
  /\binsufficient (?:quota|balance|credits?)\b/i,
  /\bcredit balance (?:exhausted|is too low)\b/i,
  /\b(?:usage limit (?:reached|exceeded)|(?:hit|reached) your usage limit)\b/i,
  /\b(?:quota|free usage) (?:exceeded|exhausted)\b/i,
  /\b(?:reached|exceeded) (?:your|its) monthly spending limit\b/i,
  /\bno payment method\b/i,
]

function containsQuotaFailure(text) {
  if (typeof text !== "string") return false
  const codes = text.toLowerCase().match(/\w+/g) ?? []
  return (
    codes.some((code) => QUOTA_ERROR_CODES.has(code)) ||
    QUOTA_MESSAGE_PATTERNS.some((pattern) => pattern.test(text))
  )
}

/** @returns {"quota" | "communication" | "other"} */
export function classifyFailure(error) {
  // Billing codes can survive in the raw body even when normalized to auth or rate-limit errors.
  if (
    error?.type === "provider.quota" ||
    [error?.type, error?.message, error?.response?.body].some(containsQuotaFailure)
  ) {
    return "quota"
  }
  return COMMUNICATION_FAILURES.has(error?.type) ? "communication" : "other"
}
