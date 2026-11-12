import { readFile } from 'node:fs/promises';
import type { Resources } from './types.ts';

/** Load the resources that ship with the bundle. */
export type ResourceLoader = (includePrSkill: boolean) => Promise<Resources>;

// The bundle root, one level above the compiled `dist/` entry point. The
// resources ship beside `package.json`, not beside the compiled modules.
const readBundled = (name: string) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');

export const loadBundledResources: ResourceLoader = async (includePrSkill) => {
  const [instructions, officialSkill, prSkill] = await Promise.all([
    readBundled('./instructions.md'),
    readBundled('./official-skill.md'),
    includePrSkill ? readBundled('./pr-skill.md') : Promise.resolve(undefined),
  ]);
  return { instructions, officialSkill, prSkill };
};
