---
name: nix-verify
description: Use after modifying Nix, flake, Home Manager, package, module, or Nix-managed dotfiles code in /Users/koki/.dotfiles. Defines the mandatory verification policy for this repository, including the completion declaration, formatting, evaluation/build checks, generated config checks, and the main-root-limited switch. The nix-verify-gate plugin enforces this policy during tool calls.
---

# Nix Verify

Use this skill whenever a task changes Nix code or files consumed by Nix in this repository (`/Users/koki/.dotfiles`), including `flake.nix`, `flake.lock`, `home.nix`, package modules, Home Manager settings, and Nix-managed config sources.

The `nix-verify-gate` plugin enforces the verification order during tool calls and prints guidance for recognized stage denials. The declaration in step 3 is a gate signal that unlocks the verification stages; it is not the final report. Give the final completion report only after verification passed or a failure has been recorded as described in the Reporting section.

## Required Policy

Run verification from the root of the checkout that contains the change, each stage as one bare, single, foreground command.

1. Inspect the change scope: check the working tree before and after edits. In git flakes, newly created Nix-consumed files must be staged early (`git add <path>`) before evaluation, or the constraint explained.
2. Implement the change fully before verification.
3. Declare completion: your own assistant text whose first non-empty line starts with `STATUS: COMPLETE`. Only this declaration in the current turn unlocks the gate; subagent reports, tool outputs, and citations do not.
4. Verify in gate-enforced order: `nix fmt`, then `nix run home-manager -- build --flake .#koki`. If `nix fmt` fails, fix and re-run it until it exits 0 before the build stage. For other repositories, use the closest equivalent checks.
5. Verify generated or managed outputs when relevant: inspect the build result (for this repo's opencode changes, `result/home-files/.config/opencode/opencode.json`) instead of assuming the attrset rendered correctly.
6. Check the OpenCode action space when the OpenCode pin changes.
   - If `packages/opencode.nix` or an MCP provider command/pin in `modules/opencode/opencode.nix` changed, run from the repository root:

     ```sh
     nix run .#opencodeActionCheck
     ```

   - Exit 1 = drift, exit 2 = inconclusive. Follow the printed 修正手順 with its approval gates: baseline additions in `modules/opencode/actions.nix` are permission grants and need user approval, then rebuild, verify the candidate generation with `--home ./result`, and keep switch gated.
7. Activate (switch) only when the user asked for the change to take effect now, you are at the `/Users/koki/.dotfiles` root on branch `main`, and fmt and build evidence ran at that root in this session. After a merge — especially one performed outside gate-observed tool calls — re-run `nix fmt` and `nix run home-manager -- build --flake .#koki` at the main checkout before switching; merges and manual terminal use produce no evidence. Linked worktrees never qualify. Accepted forms are `nix run home-manager -- switch --flake .#koki` and `home-manager switch --flake .#koki`. The gate forces human confirmation, re-checks root and branch just before spawn, and denies recognized attempts that fail its declaration, evidence, root/branch, or command-form checks. On other branches, stop after build and report activation deferred with the post-merge commands.

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
