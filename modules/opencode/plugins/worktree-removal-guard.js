export default {
  id: "worktree-removal-guard",
  async setup(ctx) {
    ctx.tool.hook("execute.before", (event) => {
      if (event.tool === "opencode_worktree_remove") {
        throw new Error("Automatic worktree removal is disabled. Use a separately authorized manual workflow.")
      }
    })
  },
}
