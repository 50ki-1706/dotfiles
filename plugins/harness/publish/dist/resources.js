import { readFile } from 'node:fs/promises';
// The bundle root, one level above the compiled `dist/` entry point. The
// resources ship beside `package.json`, not beside the compiled modules.
const readBundled = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
export const loadBundledResources = async (includePrSkill) => {
    const [instructions, officialSkill, prSkill] = await Promise.all([
        readBundled('instructions.md'),
        readBundled('official-skill.md'),
        includePrSkill ? readBundled('pr-skill.md') : Promise.resolve(undefined),
    ]);
    return { instructions, officialSkill, prSkill };
};
