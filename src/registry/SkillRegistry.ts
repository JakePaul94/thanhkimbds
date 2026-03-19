import type { Skill, SkillInput, SkillOutput } from "../types/skill";
import { log } from "../utils/logger";

export class SkillRegistry {
  private skills = new Map<string, Skill>();

  register(skill: Skill): void {
    this.skills.set(skill.name, skill);
    log.info(`  ✦ Skill registered: ${skill.name}`);
  }

  get(name: string): Skill {
    const skill = this.skills.get(name);
    if (!skill) throw new Error(`Skill not found: ${name}`);
    return skill;
  }

  list(): { name: string; description: string }[] {
    return [...this.skills.values()].map((s) => ({ name: s.name, description: s.description }));
  }

  async run<I extends SkillInput, O extends SkillOutput>(
    name: string, input: I, ctx: import("../types/skill").SkillContext
  ): Promise<O> {
    const skill = this.get(name);
    log.info({ skillName: name, jobId: ctx.jobId }, "▶ Executing skill");
    return skill.execute(input, ctx) as Promise<O>;
  }
}

// Singleton
export const registry = new SkillRegistry();
