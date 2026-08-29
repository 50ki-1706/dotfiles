import { execFile } from "node:child_process"
import { chmod, copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

const ARCHITECTURE_PATH = ".agents/architecture.md"
const DIFF_PATH = ".agents/architecture-diff.md"
const LEGACY_ARCHITECTURE_PATH = ".agents/archtecture.md"
const TEMPLATE_PATH = join(homedir(), ".config", "opencode", "example", "architecture.md")
const HEAD_MARKER = /<!--\s*opencode-architecture-head:\s*([0-9a-f]{7,40})\s*-->/i
const METADATA_DELIMITER = /^-----$/
const MAX_FILES = 120
const MAX_COMMITS = 20
const REFRESH_EVENTS = new Set(["session.created", "session.idle"])

export const ArchitectureDiffContext = async ({ client, directory, worktree }) => {
  const startDir = typeof worktree === "string" && worktree.length > 0 ? worktree : directory

  const refresh = async () => {
    try {
      await writeDiffContext(startDir)
    } catch (error) {
      await log(client, "warn", `architecture diff refresh failed: ${errorMessage(error)}`)
    }
  }

  await refresh()

  return {
    event: async ({ event }) => {
      if (!REFRESH_EVENTS.has(event.type)) return
      await refresh()
    },
  }
}

async function writeDiffContext(startDir) {
  if (!startDir) return

  const repoRoot = await gitText(startDir, ["rev-parse", "--show-toplevel"], true)
  if (!repoRoot) return

  const agentsDir = join(repoRoot, ".agents")
  const archPath = join(repoRoot, ARCHITECTURE_PATH)
  const diffFile = join(repoRoot, DIFF_PATH)
  try {
    await stat(archPath)
  } catch {
    try {
      await mkdir(agentsDir, { recursive: true })
      let initialized = false
      const legacyPath = join(repoRoot, LEGACY_ARCHITECTURE_PATH)
      try {
        await stat(legacyPath)
        await copyFile(legacyPath, archPath)
        initialized = true
      } catch {
        // Legacy file not present; fall through to template.
      }
      if (!initialized) {
        try {
          await copyFile(TEMPLATE_PATH, archPath)
        } catch {
          // Template missing or copy failed — continue without it
        }
      }
    } catch (e) {
      // Directory creation failed — continue without architecture file
    }
  }
  try {
    await chmod(archPath, 0o644)
  } catch {
    // Mode normalization failed — continue without interrupting the refresh.
  }
  const architectureText = await readText(archPath)
  const metadata = parseMetadata(architectureText)
  const agentsDirExists = await isDirectory(agentsDir)

  if (!architectureText && !agentsDirExists) return

  const currentHead = await gitText(repoRoot, ["rev-parse", "HEAD"], true)
  if (!currentHead) return

  const base = await findBaseHead(repoRoot, architectureText, metadata)
  const committedChanges = base.head
    ? await changedFiles(repoRoot, `${base.head}..HEAD`)
    : []
  const worktreeChanges = await workingTreeChanges(repoRoot)
  const recentCommits = base.head
    ? await recentCommitsSince(repoRoot, `${base.head}..HEAD`)
    : await recentCommitsSince(repoRoot, "HEAD")
  const status = architectureText
    ? committedChanges.length > 0 || worktreeChanges.length > 0
      ? "STALE"
      : base.head
        ? "CURRENT"
        : "UNKNOWN_BASE"
    : "MISSING"
  let metadataNote = ""
  if (metadata?.["commit-hash"] && base.source !== "metadata_commit_hash") {
    const shortHash = metadata["commit-hash"].slice(0, 12)
    metadataNote = `metadata commit-hash (${shortHash}) is not an ancestor of HEAD; fell back to ${base.source}`
  }

  const hasMetadataBlock = metadata !== null

  const next = render({
    status,
    base,
    committedChanges,
    currentHead,
    recentCommits,
    worktreeChanges,
    hasMetadataBlock,
    metadataNote,
  })
  const previous = await readText(diffFile)

  if (previous === next) return

  await mkdir(dirname(diffFile), { recursive: true })
  await writeFile(diffFile, next)
}

async function findBaseHead(repoRoot, architectureText, metadata) {
  // Check metadata commit-hash first (highest priority).
  // Only accepted when the commit is an ancestor of HEAD (HEAD itself included).
  if (metadata?.["commit-hash"]) {
    const resolved = await resolveAsDirectAncestor(repoRoot, metadata["commit-hash"])
    if (resolved) {
      return { head: resolved, source: "metadata_commit_hash" }
    }
  }

  const markerHead = architectureText?.match(HEAD_MARKER)?.[1]

  if (markerHead) {
    const existingMarker = await normalizeBase(repoRoot, markerHead)
    if (existingMarker) {
      return { head: existingMarker, source: "architecture_marker" }
    }
  }

  const lastArchitectureCommit = await gitText(
    repoRoot,
    ["log", "-n", "1", "--format=%H", "--", ARCHITECTURE_PATH],
    true,
  )
  if (!lastArchitectureCommit) {
    return { head: "", source: markerHead ? "missing_marker" : "none" }
  }

  const existingCommit = await normalizeBase(repoRoot, lastArchitectureCommit)
  if (existingCommit) {
    return { head: existingCommit, source: "last_architecture_commit" }
  }

  return { head: "", source: "missing_last_architecture_commit" }
}

async function normalizeBase(repoRoot, candidate) {
  const exists = await gitOk(repoRoot, ["cat-file", "-e", `${candidate}^{commit}`])
  if (!exists) return ""

  const isAncestor = await gitOk(repoRoot, ["merge-base", "--is-ancestor", candidate, "HEAD"])
  if (isAncestor) return candidate

  return await gitText(repoRoot, ["merge-base", candidate, "HEAD"], true)
}

// Returns the full commit hash only when the candidate exists and is an ancestor
// of HEAD (HEAD itself included). Returns "" otherwise.
// Unlike normalizeBase, this does NOT fall back to merge-base for non-ancestor commits.
async function resolveAsDirectAncestor(repoRoot, candidate) {
  const exists = await gitOk(repoRoot, ["cat-file", "-e", `${candidate}^{commit}`])
  if (!exists) return ""

  const isAncestor = await gitOk(repoRoot, ["merge-base", "--is-ancestor", candidate, "HEAD"])
  if (!isAncestor) return ""

  return await gitText(repoRoot, ["rev-parse", candidate], true) || candidate
}

async function changedFiles(repoRoot, range) {
  const diff = await gitText(
    repoRoot,
    ["diff", "--name-status", "--find-renames", range, "--"],
    true,
  )
  return splitLines(diff).filter((line) => !isManagedArchitectureLine(line))
}

async function workingTreeChanges(repoRoot) {
  const status = await gitText(
    repoRoot,
    ["status", "--short", "--untracked-files=all"],
    true,
  )
  return splitLines(status).filter((line) => !line.includes(DIFF_PATH))
}

async function recentCommitsSince(repoRoot, revision) {
  const args =
    revision === "HEAD"
      ? ["log", `--max-count=${MAX_COMMITS}`, "--format=%h %s", "HEAD"]
      : ["log", `--max-count=${MAX_COMMITS}`, "--format=%h %s", revision, "--"]
  return splitLines(await gitText(repoRoot, args, true))
}

function render({ status, base, committedChanges, currentHead, recentCommits, worktreeChanges, hasMetadataBlock, metadataNote }) {
  const shortBase = base.head ? base.head.slice(0, 12) : "(none)"
  const shortHead = currentHead.slice(0, 12)
  const marker = `<!-- opencode-architecture-head: ${currentHead} -->`
  const refreshInstruction = hasMetadataBlock
    ? `- After refreshing ${ARCHITECTURE_PATH}, set \`commit-hash\` to \`suggested_metadata_commit_hash\` and set \`date\` to today in the metadata block.`
    : `- After refreshing ${ARCHITECTURE_PATH}, replace or add the current_head_marker.`
  const guidance =
    status === "MISSING" || status === "UNKNOWN_BASE"
      ? `- Ask executer to create or populate ${ARCHITECTURE_PATH}, replacing all placeholder/template content with real project information.
${refreshInstruction}
- Treat this file as a change detector, not as evidence; confirm findings by reading source files.`
      : `- If status is STALE, ask deep_explore to inspect the listed files first.
${refreshInstruction}
- Treat this file as a change detector, not as evidence; confirm findings by reading source files.`

  return `# Architecture Diff Context

Generated by the OpenCode ArchitectureDiffContext plugin. Do not edit by hand.

- status: ${status}
- architecture_file: ${ARCHITECTURE_PATH}
- base_source: ${base.source}
- base_head: ${shortBase}
- current_head: ${shortHead}
- current_head_marker: ${marker}
- suggested_metadata_commit_hash: ${currentHead}
- has_metadata_block: ${hasMetadataBlock}${metadataNote ? `\n- metadata_note: ${metadataNote}` : ""}

## update_guidance
${guidance}

## changed_files_since_base
\`\`\`text
${formatLines(committedChanges, "(no committed file changes since base)", MAX_FILES)}
\`\`\`

## working_tree_changes
\`\`\`text
${formatLines(worktreeChanges, "(no working tree changes)", MAX_FILES)}
\`\`\`

## recent_commits_since_base
\`\`\`text
${formatLines(recentCommits, "(no recent commits to report)", MAX_COMMITS)}
\`\`\`
`
}

function formatLines(lines, empty, limit) {
  if (lines.length === 0) return empty
  const shown = lines.slice(0, limit)
  const suffix = lines.length > limit ? [`... ${lines.length - limit} more`] : []
  return [...shown, ...suffix].join("\n").replaceAll("```", "` ` `")
}

function splitLines(value) {
  return value
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
}

function isManagedArchitectureLine(line) {
  return line.includes(ARCHITECTURE_PATH) || line.includes(DIFF_PATH)
}

function parseMetadata(text) {
  if (!text) return null

  // Strip BOM if present
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1)
  }

  const lines = text.split("\n")
  let idx = 0

  // Skip leading blank lines
  while (idx < lines.length && lines[idx].trim() === "") {
    idx++
  }

  // First non-blank line must be the opening delimiter
  if (idx >= lines.length || !METADATA_DELIMITER.test(lines[idx].trim())) {
    return null
  }
  idx++

  const metadata = {}

  while (idx < lines.length) {
    const line = lines[idx].trim()
    idx++

    // Closing delimiter found — done
    if (METADATA_DELIMITER.test(line)) {
      return metadata
    }

    const kv = line.match(/^([a-z][a-z-]*):\s*(.+)$/i)
    if (kv) {
      // Last-wins for duplicate keys
      metadata[kv[1].trim()] = kv[2].trim()
    }
  }

  // Closing delimiter missing — incomplete block
  return null
}

async function gitText(cwd, args, allowFailure = false) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
      maxBuffer: 1024 * 1024,
    })
    return stdout.trim()
  } catch (error) {
    if (allowFailure) return ""
    throw error
  }
}

async function gitOk(cwd, args) {
  try {
    await execFileAsync("git", ["-C", cwd, ...args], {
      maxBuffer: 1024 * 1024,
    })
    return true
  } catch {
    return false
  }
}

async function readText(file) {
  try {
    return await readFile(file, "utf8")
  } catch {
    return ""
  }
}

async function isDirectory(file) {
  try {
    return (await stat(file)).isDirectory()
  } catch {
    return false
  }
}

async function log(client, level, message) {
  if (!client?.app?.log) return
  await client.app.log({
    body: {
      service: "architecture-diff-context",
      level,
      message,
    },
  })
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}
