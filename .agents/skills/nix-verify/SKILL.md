---
name: nix-verify
description: Use after modifying Nix, flake, Home Manager, package, module, or Nix-managed dotfiles code in /Users/koki/.dotfiles. Defines the mandatory verification policy for this repository, including formatting, evaluation/build checks, generated config checks, and when to run switch.
---

# Nix Verify

Use this skill whenever a task changes Nix code or files consumed by Nix in this repository (`/Users/koki/.dotfiles`), including `flake.nix`, `flake.lock`, `home/*.nix`, package modules, Home Manager settings, and Nix-managed config sources.

## Required Policy

After any Nix-related change, do not report completion until verification has been attempted.

Run checks from `/Users/koki/.dotfiles`, the repository root.

1. Inspect the change scope.
   - Check the working tree before and after edits.
   - If a newly created file is imported by a flake or module, make sure it is visible to Nix. In git flakes, untracked imported files can break evaluation; stage the file when appropriate or explain the constraint.

2. Format Nix code after every Nix codebase change.
   - Formatting is mandatory whenever Nix code or Nix-consumed config has been changed.
   - Prefer the repository formatter, usually `nix fmt`.
    - For this repository (`/Users/koki/.dotfiles`), run:

     ```sh
     nix fmt
     ```

   - If formatting fails because of an existing formatter issue or environment problem, record the exact failure and continue to the build/evaluation check when possible.

3. Evaluate or build the changed Nix configuration.
    - For this repository (`/Users/koki/.dotfiles`), the mandatory non-activating check is:

     ```sh
     nix run home-manager -- build --flake .#koki
     ```

   - For other repos, use the closest equivalent such as `nix flake check`, `nix build`, or the project’s documented Home Manager/NixOS build command.

4. Verify generated or managed outputs when relevant.
   - If Nix generates a config file, inspect the generated result rather than assuming the attrset rendered correctly.
   - For this repo’s opencode config, check `result/home-files/.config/opencode/opencode.json` after a Home Manager build when opencode settings or prompts changed.

5. Run activation only when the user asked for the change to take effect now.
    - For this repository (`/Users/koki/.dotfiles`), activation is:

     ```sh
     nix run home-manager -- switch --flake .#koki
     ```

   - `build` validates without changing the active environment. `switch` changes the user environment and may update symlinks, profiles, launch agents, and PATH-visible tools.

## Reporting

In the final response, state:

- which verification commands were run;
- whether each command passed or failed;
- any warnings that matter, such as dirty-tree warnings, formatter failures, or untracked-file evaluation issues;
- whether the active environment was switched or only built.

If verification cannot be completed, say so clearly and include the next command the user should run.

## Sandbox Notes

Nix may need access outside the workspace for the daemon, store, cache, or user profile. If a required Nix command fails with a sandbox or cache/database permission error, rerun it with the appropriate approval request instead of silently skipping verification.
