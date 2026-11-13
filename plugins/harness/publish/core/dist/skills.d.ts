import type { Resources, SkillEntry } from './types.ts';
/**
 * Assert that each required skill resolves to exactly one catalog entry at the
 * trusted path with unmodified body text.
 *
 * The harness adapter has already asked the user for permission to load these
 * skills; this check keeps a substituted or shadowed skill from reaching the
 * prompt.
 *
 * Returns the skill IDs to attach to the command prompt.
 */
export declare function verifyRequiredSkills(skills: SkillEntry[], resources: Resources, includePrSkill: boolean): string[];
