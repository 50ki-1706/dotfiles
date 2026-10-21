import assert from "node:assert/strict"
import test from "node:test"

import { classifyFailure } from "../src/failures.js"

const quotaErrors = [
  { type: "provider.quota" },
  ...[
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
  ].map((code) => ({
    type: "provider.rate-limit",
    status: 429,
    message: "Request rejected",
    response: { body: JSON.stringify({ error: { code, message: "Request rejected" } }) },
  })),
  ...[
    "CreditsError",
    "MonthlyLimitError",
    "UserLimitError",
    "FreeUsageLimitError",
    "GoUsageLimitError",
    "BlackUsageLimitError",
    "CreditLimitExceeded",
  ].map((type) => ({
    type:
      type === "CreditsError" || type === "MonthlyLimitError" || type === "UserLimitError"
        ? "provider.auth"
        : "provider.rate-limit",
    message: "Request rejected",
    response: { body: JSON.stringify({ type: "error", error: { type, message: "Request rejected" } }) },
  })),
]

test("quota detection recognizes spending-limit and credit messages by message text", () => {
  assert.equal(
    classifyFailure({
      type: "unknown",
      message:
        "personal-team-blocked:spending-limit: gRPC error: You have run out of credits or need a Grok subscription. Add credits at https://grok.com/?_s=usage or upgrade at https://grok.com/supergrok.",
    }),
    "quota",
  )
  assert.equal(classifyFailure({ message: "SPENDING-LIMIT" }), "quota")
  assert.equal(classifyFailure({ type: "provider.other", message: "Run out of credits" }), "quota")
  assert.equal(classifyFailure({ type: "provider.other", message: "too many requests" }), "other")
  assert.equal(classifyFailure(undefined), "other")
  assert.equal(classifyFailure({ type: "provider.quota" }), "quota")
})

test("OpenAI and Zen quota codes survive generic summaries and normalized error types", () => {
  for (const error of quotaErrors) {
    assert.equal(classifyFailure(error), "quota", JSON.stringify(error))
    if (error.response) {
      assert.equal(classifyFailure({ message: error.response.body }), "quota")
    }
  }
  assert.equal(classifyFailure({ type: "FreeUsageLimitError" }), "quota")
})

test("message-only API, subscription, free usage, and monthly spending caps switch immediately", () => {
  for (const message of [
    "You exceeded your current quota, please check your plan and billing details.",
    "Insufficient balance. Manage your billing here.",
    "Your credit balance is too low to access the API.",
    "You have hit your usage limit. Try again later.",
    "ChatGPT usage limit reached. Check Settings for details.",
    "Free usage exceeded, add credits.",
    "Subscription quota exceeded. Retry later.",
    "5-hour usage limit reached. Resets later.",
    "Weekly usage limit reached. Resets later.",
    "Your workspace has reached its monthly spending limit of $20.",
    "You have reached your monthly spending limit of $20.",
    "No payment method. Add a payment method here.",
  ]) {
    assert.equal(classifyFailure({ type: "unknown", message }), "quota", message)
  }
})

test("transient rate limits and unrelated auth, request, and context errors are not immediate", () => {
  for (const error of [
    { type: "provider.rate-limit", status: 429, message: "Rate limit exceeded. Please try again later." },
    { type: "provider.rate-limit", message: "Rate limit reached for requests per minute." },
    { type: "provider.rate-limit", response: { body: '{"error":{"type":"RateLimitError"}}' } },
    { type: "provider.rate-limit", response: { body: '{"error":{"code":"slow_down"}}' } },
    { type: "provider.rate-limit", response: { body: '{"error":{"code":"rate_limit_exceeded"}}' } },
    { type: "provider.auth", status: 401, message: "Invalid API key." },
    { type: "provider.invalid-request", message: "Maximum context length exceeded." },
    { type: "provider.invalid-request", response: { body: '{"error":{"code":"context_length_exceeded"}}' } },
    { type: "provider.content-filter", message: "Content policy violation." },
    { message: 429, response: { body: { error: "insufficient_quota" } } },
    { response: { body: "malformed JSON" } },
  ]) {
    assert.notEqual(classifyFailure(error), "quota", JSON.stringify(error))
  }
})

test("communication failures retain threshold-based handling", () => {
  for (const type of ["provider.transport", "provider.timeout", "provider.internal", "provider.rate-limit"]) {
    assert.equal(classifyFailure({ type }), "communication", type)
    assert.equal(classifyFailure({ type, message: "Insufficient quota" }), "quota", type)
  }
})

test("quota codes are case-insensitive whole tokens", () => {
  assert.equal(classifyFailure({ message: "INSUFFICIENT_QUOTA" }), "quota")
  assert.equal(classifyFailure({ message: "prefix_insufficient_quota" }), "other")
  assert.equal(classifyFailure({ message: "CreditsErrorSuffix" }), "other")
})
