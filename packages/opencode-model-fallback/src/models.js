function modelParts(model) {
  if (typeof model === "string") {
    const separator = model.indexOf("/")
    if (separator < 1) return null

    const providerID = model.slice(0, separator)
    const rest = model.slice(separator + 1)
    const variantSeparator = rest.indexOf("#")
    const id = variantSeparator < 0 ? rest : rest.slice(0, variantSeparator)
    const variant = variantSeparator < 0 ? undefined : rest.slice(variantSeparator + 1)
    if (!id || variant === "") return null
    return { providerID, id, variant }
  }

  if (!model || typeof model !== "object") return null
  const providerID = model.providerID ?? model.provider
  const id = model.id
  if (typeof providerID !== "string" || typeof id !== "string") return null
  const variant = typeof model.variant === "string" && model.variant !== "" ? model.variant : undefined
  return { providerID, id, variant }
}

export function sameModel(left, right) {
  const leftParts = modelParts(left)
  const rightParts = modelParts(right)
  return (
    leftParts !== null &&
    rightParts !== null &&
    leftParts.providerID === rightParts.providerID &&
    leftParts.id === rightParts.id &&
    (leftParts.variant ?? "default") === (rightParts.variant ?? "default")
  )
}

export function switchTarget(model) {
  const parts = modelParts(model)
  if (!parts) return null
  const target = { providerID: parts.providerID, id: parts.id }
  if (parts.variant && parts.variant !== "default") target.variant = parts.variant
  return target
}
