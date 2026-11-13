import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
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
export function loadResourcesFrom(directory) {
    const read = async (name) => {
        try {
            return await readFile(join(directory, name), 'utf8');
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return undefined;
            throw error;
        }
    };
    return async (includePrSkill) => {
        const [instructions, officialSkill, prSkill] = await Promise.all([
            read('instructions.md'),
            read('official-skill.md'),
            includePrSkill ? read('pr-skill.md') : Promise.resolve(undefined),
        ]);
        if (instructions === undefined)
            throw new Error(`Missing instructions.md in ${directory}`);
        return { instructions, officialSkill, prSkill };
    };
}
