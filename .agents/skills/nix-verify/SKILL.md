---
name: nix-verify
description: Use after modifying Nix, flake, Home Manager, package, module, or Nix-managed dotfiles code in /Users/koki/.dotfiles. Defines the mandatory verification policy for this repository, including the completion declaration, formatting, evaluation/build checks, generated config checks, and the main-root-limited switch. The nix-verify-gate plugin enforces this policy during tool calls.
---

# Nix Verify

Use this skill whenever a task changes Nix code or files consumed by Nix in this repository (`/Users/koki/.dotfiles`), including `flake.nix`, `flake.lock`, `home.nix`, package modules, Home Manager settings, and Nix-managed config sources.

The `nix-verify-gate` plugin (deployed to `~/.config/opencode/plugins/nix-verify-gate.js`) enforces this policy during tool calls. It does not run anything for you: it denies attempts that skip a stage and prints the exact next command in Japanese. Follow the order below.

## Required Policy

Run every verification command from the checkout root that contains the change, each as one bare, single, foreground command.

1. Inspect the change scope.
   - Check the working tree before and after edits.
   - If a newly created file is imported by a flake or module, make sure it is visible to Nix. In git flakes, untracked imported files can break evaluation; run `git add <path>` for new Nix-consumed files early and explain the constraint when staging is not appropriate.

2. Implement the change fully before verification.

3. Declare completion as your own assistant text whose first non-empty line starts with:

   ```text
   STATUS: COMPLETE
   ```

   - Emit the declaration in the current turn before running verification. The gate unlocks when the line starts with `STATUS: COMPLETE`; details may follow on the same line or on later lines.
   - A `STATUS: COMPLETE` reported by a subagent does not unlock the gate, and neither do tool outputs or mid-text citations. The check looks only at the first line of your own assistant text after the last user message.

4. Run the verification pipeline in order:
   - Step 1: `nix fmt`
   - Step 2: `nix run home-manager -- build --flake .#koki` (for this repository)

   - Run both from the checkout root that contains the change, as bare single commands. The gate accepts only the exact strings `nix fmt` and `nix run home-manager -- build --flake .#koki`; wrappers and compounds (`env`, `&`, `bash -c`, `&&` chains, pipes, redirects) are denied and never count as evidence.
   - For other repos, use the closest equivalent such as `nix flake check`, `nix build`, or the project’s documented Home Manager/NixOS build command.
   - If `nix fmt` fails, fix the formatting problem and re-run `nix fmt` until it exits 0; the gate requires successful fmt evidence before the build stage for this repository. For other repositories, record the failure and continue to the equivalent check when possible.

5. Verify generated or managed outputs when relevant.
   - If Nix generates a config file, inspect the generated result rather than assuming the attrset rendered correctly.
   - For this repo’s opencode config, check `result/home-files/.config/opencode/opencode.json` after a Home Manager build when opencode settings or prompts changed.

6. Check the OpenCode action space when the OpenCode pin changes.
   - If `packages/opencode.nix` or an MCP provider command/pin in `modules/opencode/opencode.nix` changed, run from the repository root:

     ```sh
     nix run .#opencodeActionCheck
     ```

   - Exit 1 = drift, exit 2 = inconclusive. Follow the printed 修正手順 with its approval gates: baseline additions in `modules/opencode/actions.nix` are permission grants and need user approval, then rebuild, verify the candidate generation with `--home ./result`, and keep switch gated.

7. Run activation (switch) only when all of the following hold:
   - The user asked for the change to take effect now.
   - You are working from the `/Users/koki/.dotfiles` root with branch `main` checked out.
   - The `nix fmt` and `nix run home-manager -- build --flake .#koki` evidence ran at that root in this session.

   The command is:

   ```sh
   nix run home-manager -- switch --flake .#koki
   ```

   - A linked worktree that merely carries `main` does NOT qualify. After merging a branch, produce fresh fmt and build evidence at the main checkout root before attempting switch.
   - The gate accepts only `nix run home-manager -- switch --flake .#koki` and `home-manager switch --flake .#koki`; both pin the verified flake target `.#koki`. An unbound `home-manager switch` without `--flake` is denied as unbound.
   - The gate always forces a human confirmation (`ask`) for switch; it never auto-approves activation.
   - Even after human approval, the gate re-checks the main root and the branch immediately before the switch command spawns and aborts the switch if either check fails.
   - If you are not at the main root on `main` (for example, a fix branch worktree), STOP after build and report that activation is deferred, including the post-merge commands to run at `/Users/koki/.dotfiles`.

## Reporting

In the final response, state:

- which verification commands were run and each exit status;
- the branch and checkout root used for verification;
- which gate stage was reached (declaration, fmt, build, or switch);
- whether the active environment was switched or only built, and if activation is deferred, why and with which post-merge commands;
- any warnings that matter, such as dirty-tree warnings, formatter failures, or untracked-file evaluation issues.

If verification cannot be completed, say so clearly and include the next command the user should run.

## Gate Limitations

- The gate is attempt gating, not execution forcing: it observes tool calls and permission evaluations, and it cannot make you run a command. The only command-level control is the execution-boundary interlock, which aborts an already-approved switch when the root/branch check fails just before spawn.
- It is a guard, not a lock. Manual terminal use is out of scope, and adversarial re-encodings can evade text scanning. Non-canonical `home-manager switch` spellings are detected and forced to `ask`; exotic spellings depend on the resources the runtime scanner reports, which the gate captures at runtime.
- Evidence is conservative: any recognized mutation (`rm`/`mv`/`cp`, `sed -i`, `git checkout`/`merge`/`restore`/`revert`/`switch`/`worktree`/`clone`, file redirects, edit-family tools) clears the session’s evidence, and a new `nix fmt` also clears it because fmt may change files. The git mutation check is word-level and can false-positive.
- Classification is heuristic text matching and can false-positive (for example, `echo "nix fmt"` counts as a fmt attempt). False positives only clear evidence or block a stage.
- This skill and the gate cannot replace reading the actual build output.

## Sandbox Notes

Nix may need access outside the workspace for the daemon, store, cache, or user profile. If a required Nix command fails with a sandbox or cache/database permission error, rerun it with the appropriate approval request instead of silently skipping verification.
