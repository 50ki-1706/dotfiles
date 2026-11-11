import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { PluginContext, Resources, SkillEntry } from './types.ts';

/** Load resources bundled beside the plugin entry point. */
export type ResourceLoader = (includePrSkill: boolean) => Promise<Resources>;

const readBundled = (name: string) => readFile(new URL(name, import.meta.url), 'utf8');

export const loadBundledResources: ResourceLoader = async (includePrSkill) => {
  const [instructions, officialSkill, prSkill] = await Promise.all([
    readBundled('./instructions.md'),
    readBundled('./official-skill.md'),
    includePrSkill ? readBundled('./pr-skill.md') : Promise.resolve(undefined),
  ]);
  return { instructions, officialSkill, prSkill };
};

/** Drop a leading YAML front matter block; the runtime compares bodies, not metadata. */
const skillBody = (content: string) => content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '').trim();

type RequiredSkill = { id: string; content?: string; trustedPath?: string };

function requiredSkills(resources: Resources, includePrSkill: boolean): RequiredSkill[] {
  const base: RequiredSkill[] = [
    { id: 'git-surgeon', content: resources.officialSkill, trustedPath: resources.trustedSkillPath },
  ];
  return includePrSkill
    ? [...base, { id: 'pr', content: resources.prSkill, trustedPath: resources.trustedPrSkillPath }]
    : base;
}

const defaultSkillPath = (id: string) => join(homedir(), '.config/opencode/skills', id, 'SKILL.md');

/**
 * Assert that each required skill resolves to exactly one entry at the trusted
 * path with unmodified body text, then record the runtime permission.
 *
 * Returns the skill IDs to attach to the command prompt.
 */
export async function verifyRequiredSkills(
  ctx: PluginContext,
  sessionID: string,
  skills: SkillEntry[],
  resources: Resources,
  includePrSkill: boolean,
): Promise<string[]> {
  const required = requiredSkills(resources, includePrSkill);
  for (const skill of required) {
    const matches = skills.filter((entry) => entry.id === skill.id);
    const trusted = skill.trustedPath ?? defaultSkillPath(skill.id);
    const untrusted = matches.length !== 1
      || !skill.content
      || !skillBody(skill.content)
      || resolve(matches[0].path) !== resolve(trusted)
      || matches[0].content.trim() !== skillBody(skill.content);
    if (untrusted) throw new Error(`Missing or untrusted ${skill.id} skill`);
    await ctx.permission.assert({ sessionID, action: 'skill', resources: [skill.id] });
  }
  return required.map((skill) => skill.id);
}
