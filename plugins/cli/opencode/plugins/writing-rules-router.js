import { execFile } from "node:child_process"
import { lstat, readdir } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"

const run = promisify(execFile)
const RULES = @LANGUAGE_RULES@
const LANGUAGE_ENTRIES = Object.entries(RULES)
const LANGUAGE_NAMES = Object.keys(RULES)
const AGENTS = new Set(["spec", "general"])
const MARKER = "writing-rules-router"
const SKIP = new Set([
  ".git", ".hg", ".svn", "node_modules", "vendor", "target", "dist", "build", ".next",
  ".venv", "venv", ".tox", "__pycache__", ".cache", ".mypy_cache", "coverage",
])
const MAX_FILES = 20000

export default {
  id: MARKER,
  async setup(ctx) {
    ctx.session.hook("context", async (event) => {
      if (!AGENTS.has(event.agent)) return
      // Request-scoped system parts are recomputed after moves and compaction, not added to history.
      event.system = event.system.filter((part) => !part.metadata?.[MARKER])
      try {
        const session = await ctx.session.get({ sessionID: event.sessionID })
        const directory = session?.location?.directory
        if (typeof directory !== "string" || !path.isAbsolute(directory)) return
        const languages = await detectLanguages(directory)
        if (languages.length === 0) return
        event.system.push({
          type: "text",
          text: languages.map((name) => RULES[name].text).join("\n\n"),
          metadata: { [MARKER]: true },
        })
      } catch (error) {
        console.warn(`writing rules routing skipped: ${error instanceof Error ? error.message : String(error)}`)
      }
    })
  },
}

async function detectLanguages(directory) {
  const files = await projectFiles(directory)
  const found = new Set()
  for (const filename of files) {
    if (!isCandidate(filename)) continue
    const basename = path.basename(filename)
    const extension = path.extname(filename)
    const matches = LANGUAGE_ENTRIES.filter(([name, rule]) => !found.has(name) &&
      (rule.filenames.includes(basename) || rule.extensions.includes(extension)))
    if (matches.length === 0) continue
    // Git can list deleted files and symlinks; neither should select a language.
    const stat = await lstat(path.join(directory, filename)).catch(() => undefined)
    if (!stat?.isFile()) continue
    for (const [name] of matches) found.add(name)
    if (found.size === LANGUAGE_NAMES.length) break
  }
  return LANGUAGE_NAMES.filter((name) => found.has(name))
}

function isCandidate(filename) {
  const parts = filename.split(/[\\/]/)
  return !path.isAbsolute(filename) && !parts.some((part) =>
    part === ".." || SKIP.has(part) || /^\.env/.test(part) || /\.(?:key|pem)$/.test(part) || /^id_rsa/.test(part))
}

async function projectFiles(directory) {
  try {
    const { stdout } = await run("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "."], {
      cwd: directory, timeout: 2000, maxBuffer: 8 * 1024 * 1024,
    })
    return stdout.split("\0").filter(Boolean)
  } catch {
    // Non-Git projects still route by filenames; do not follow directory symlinks.
    const files = []
    const directories = [""]
    let visited = 0
    while (directories.length > 0 && visited < MAX_FILES) {
      const relative = directories.pop()
      const entries = await readdir(path.join(directory, relative), { withFileTypes: true }).catch((error) => {
        if (["EACCES", "EPERM", "ENOENT"].includes(error.code)) return []
        throw error
      })
      for (const entry of entries) {
        if (++visited > MAX_FILES) break
        const filename = path.join(relative, entry.name)
        if (!isCandidate(filename)) continue
        if (entry.isDirectory()) directories.push(filename)
        else if (entry.isFile()) files.push(filename)
      }
    }
    return files
  }
}
