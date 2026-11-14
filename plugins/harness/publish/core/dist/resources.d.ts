import type { Resources } from './types.ts';
/** Load the resources that ship with a bundle. */
export type ResourceLoader = (includePrSkill: boolean) => Promise<Resources>;
/**
 * Build a loader that reads the bundle's resources from `directory`.
 *
 * The core owns no resources of its own: the instructions and the two skills
 * belong to the bundle that ships them, so each adapter passes its directory
 * rather than relying on a path relative to the core's compiled output.
 *
 * Only `instructions.md` is required. A harness that resolves skills from its
 * own catalog (Codex) ships no skill files, and the mount then verifies no
 * skill at all.
 *
 * @param directory - absolute path holding `instructions.md`, and optionally
 *   `official-skill.md` and `pr-skill.md`.
 * @returns the loader the mount uses.
 */
export declare function loadResourcesFrom(directory: string): ResourceLoader;
