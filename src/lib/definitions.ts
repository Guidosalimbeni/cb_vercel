import { parseFrontmatter, listValue } from "./frontmatter";
import type { Repo } from "./repo";

export interface CommandDef {
  name: string;
  description: string;
  argumentHint: string;
  body: string;
}

export interface AgentDef {
  name: string;
  description: string;
  tools: string[];
  body: string;
}

export interface SkillInfo {
  name: string;
  description: string;
  standing: "trusted" | "staging";
}

export function loadCommands(repo: Repo): CommandDef[] {
  return repo
    .glob(".claude/commands/*.md")
    .map((p) => {
      const { data, body } = parseFrontmatter(repo.read(p) ?? "");
      return {
        name: p.split("/").pop()!.replace(/\.md$/, ""),
        description: data.description ?? "",
        argumentHint: data["argument-hint"] ?? "",
        body: body.trim(),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function loadAgents(repo: Repo): AgentDef[] {
  return repo
    .glob(".claude/agents/*.md")
    .map((p) => {
      const { data, body } = parseFrontmatter(repo.read(p) ?? "");
      return {
        name: data.name || p.split("/").pop()!.replace(/\.md$/, ""),
        description: data.description ?? "",
        tools: listValue(data.tools).length ? listValue(data.tools) : (data.tools ?? "").split(",").map((s) => s.trim()).filter(Boolean),
        body: body.trim(),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function loadSkills(repo: Repo): SkillInfo[] {
  const read = (dir: string, standing: SkillInfo["standing"]) =>
    repo.glob(`${dir}/*/SKILL.md`).map((p) => {
      const { data } = parseFrontmatter(repo.read(p) ?? "");
      return { name: data.name || p.split("/")[2], description: data.description ?? "", standing };
    });
  return [...read(".claude/skills", "trusted"), ...read(".claude/skills-staging", "staging")];
}

/** Substitute $ARGUMENTS the way Claude Code does. */
export function expandCommand(cmd: CommandDef, args: string): string {
  const a = args.trim();
  return cmd.body.includes("$ARGUMENTS") ? cmd.body.split("$ARGUMENTS").join(a) : a ? `${cmd.body}\n\nARGUMENTS: ${a}` : cmd.body;
}
