import { resolve } from 'node:path';
/** Drop a leading YAML front matter block; the harness compares bodies, not metadata. */
const skillBody = (content) => content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '').trim();
/**
 * The skills this bundle ships, in attachment order.
 *
 * A bundle that ships no skill file leaves the corresponding entry out: the
 * harness then resolves that skill from its own catalog, and there is nothing
 * for this check to verify against.
 */
function requiredSkills(resources, includePrSkill) {
    const base = resources.officialSkill === undefined
        ? []
        : [{ id: 'git-surgeon', content: resources.officialSkill, trustedPath: resources.trustedSkillPath }];
    return includePrSkill && resources.prSkill !== undefined
        ? [...base, { id: 'pr', content: resources.prSkill, trustedPath: resources.trustedPrSkillPath }]
        : base;
}
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
export function verifyRequiredSkills(skills, resources, includePrSkill) {
    const required = requiredSkills(resources, includePrSkill);
    for (const skill of required) {
        const matches = skills.filter((entry) => entry.id === skill.id);
        const [match] = matches;
        const untrusted = matches.length !== 1
            || match === undefined
            || !skill.content
            || !skillBody(skill.content)
            || (skill.trustedPath !== undefined && resolve(match.path) !== resolve(skill.trustedPath))
            || match.content.trim() !== skillBody(skill.content);
        if (untrusted)
            throw new Error(`Missing or untrusted ${skill.id} skill`);
    }
    return required.map((skill) => skill.id);
}
