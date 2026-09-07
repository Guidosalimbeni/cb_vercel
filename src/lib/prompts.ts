import type { Repo } from "./repo";
import type { AgentDef, SkillInfo } from "./definitions";
import { today } from "./config";

export function houseRules(repo: Repo): string {
  return repo.read("CLAUDE.md")?.trim() ?? "";
}

function skillsSection(skills: SkillInfo[]): string {
  const trusted = skills.filter((s) => s.standing === "trusted");
  const staging = skills.filter((s) => s.standing === "staging");
  const line = (s: SkillInfo) => `- \`${s.name}\`: ${s.description}`;
  return [
    "## Skills",
    "Load a skill's instructions with `load_skill` when a command or agent says to invoke it.",
    trusted.length ? `Trusted (in .claude/skills/, use freely):\n${trusted.map(line).join("\n")}` : "Trusted: none yet.",
    staging.length
      ? `Staging (in .claude/skills-staging/, captured once and unproven; offer only when relevant and say it is unproven):\n${staging.map(line).join("\n")}`
      : "Staging: none yet.",
  ].join("\n");
}

const TOOL_NOTES = `## Platform notes
You are running inside the cb web app, not the Claude Code CLI. The repository lives on GitHub and every write you make is a git commit attributed to you. Your tools are the app's equivalents of Claude Code's built-ins:
- read_file = Read, write_file = Write, edit_file = Edit, grep = Grep, glob = Glob, list_directory = LS, load_skill = Skill.
- There is no Bash and no shell. Where a prompt says \`rg\`, \`grep -rn\`, \`ls\` or similar, use grep, glob and list_directory. Nothing can be executed here unless a \`code_execution\` tool appears in your tool list.
- Paths are relative to the repository root: wiki/..., .claude/..., raw/....
- raw/ is immutable (the app refuses writes there). .cb/ holds conversation state and is invisible to you by design.
- Prefer edit_file for changes to an existing file; write_file replaces the whole file and requires reading it first.
- Read wiki/README.md and wiki/questions/INDEX.md before searching blindly; use grep to find pages, then read them.`;

export function buildMainSystem(repo: Repo, opts: { skills: SkillInfo[]; agents: AgentDef[]; qid?: string; commandNames: string[]; codeExecution: boolean; analyst?: string }): string {
  const agentLines = opts.agents.map((a) => `- \`${a.name}\`: ${a.description}`).join("\n");
  const parts = [
    houseRules(repo),
    TOOL_NOTES,
    `## How this conversation works
- Today is ${today()}. Use it for \`on:\` spans, \`opened:\` and \`recorded_on:\` fields. The analyst's name for \`{by:...}\` spans is "${opts.analyst || "analyst"}" unless they tell you otherwise.
- The analyst uses a web UI and is not a developer: write for them in plain language, short paragraphs, and lead with what they need to know. Your final text of each turn is shown to them as the result, so make it read well on its own.
- **Every question goes through \`ask_analyst\`**, never as plain text at the end of a turn. It shows the analyst your options as buttons plus an "Other" box, and your turn continues with their answer as the tool result. Use it for the interviewer's questions (keep the interviewer's wording, take its suggested options), for the every-third-exchange checkpoint (proceed / keep going / park it, with your recommendation first), for data_mode, deliverable and delivery, and for any confirmation. One ask_analyst call per turn; several questions can go in one call.
- "Stop and wait for the analyst" for a deliverable (a notebook or report they must run or read) means: finish your turn with a short summary of what you wrote and where. Their reply arrives as the next user message.
- Slash commands arrive as user messages starting with a line like \`[/cb_ask "..."]\` followed by that command's instructions. Available: ${opts.commandNames.map((c) => "/" + c).join(", ")}.
${opts.qid ? `- This thread belongs to question \`${opts.qid}\`. "The open one" means this question.` : "- No question is attached to this thread yet. If a command opens one, the thread will follow it from then on."}
${
  opts.codeExecution
    ? "- A `code_execution` tool is available on this turn (Anthropic's sandbox: Python with pandas, numpy, scipy, statsmodels, scikit-learn, matplotlib; no network; pip may or may not reach further packages such as dowhy). Use it only when the question record says `run_here: true` or the analyst explicitly asked you to run the code here, and always write the .ipynb to the repository as well. Say plainly what ran and what did not."
    : "- No code can be executed on this turn. If the analyst asks you to run a notebook here, tell them to re-run /cb_dag or /cb_notebook, where a code_execution tool is available."
}

## Subagents
Call \`invoke_subagent\` to run one. It runs the named agent to completion in its own isolated context: it sees only the task text you give it plus the repository, never this conversation, and returns its final text to you as the tool result. The agents (from .claude/agents/):
${agentLines}

- **Isolation is the point for reviewer and librarian.** Give them the question id, file paths, the question verbatim, and the specific things to check. Do not summarise the interview, do not say what you hope they conclude.
- **Multi-turn agents (the interviewer).** A subagent cannot talk to the analyst directly; it ends its turn with the question it needs answered, you relay it to the analyst verbatim, and when the answer comes back you call \`invoke_subagent\` again with \`resume: true\` and the answer as the task. The agent's own conversation is kept on this thread, so it continues with full memory. Use \`resume: false\` (the default) only to start an agent fresh.
- Relay a subagent's output faithfully, including its \`[lib]\`/\`[bg]\` markers and its argument against itself. Quote verdicts, do not paraphrase them.
- If a subagent's result says it ran out of time budget, call it again with \`resume: true\` and the task "continue".`,
    skillsSection(opts.skills),
  ];
  return parts.filter(Boolean).join("\n\n");
}

export function buildSubagentSystem(repo: Repo, agent: AgentDef, skills: SkillInfo[], extra: string[] = []): string {
  const parts = [
    houseRules(repo),
    `# You are the \`${agent.name}\` subagent\n\n${agent.body}`,
    TOOL_NOTES,
    `## How you were invoked
- Today is ${today()}.
- The main agent invoked you with a task. You see only that task and the repository, never the main conversation. Work with your tools until you are done, then end with your answer as plain text: that text is everything the main agent receives.
- You cannot talk to the analyst directly. If you need something only they know (an interview question, a checkpoint, a confirmation), end your turn with exactly what to ask, clearly marked, **and offer 2 to 4 plausible answers as options** (the main agent shows them as choices plus a free-text "Other"). One question at a time. The main agent relays it, and you will be invoked again with their answer and your memory of this exchange intact.
- Write for a non-developer: plain language, short, no jargon that the wiki itself does not use.
- Your tools are the ones your definition allows${agent.tools.length ? ` (${agent.tools.join(", ")})` : ""}, mapped to this platform's equivalents.`,
    ...extra,
    skillsSection(skills),
  ];
  return parts.filter(Boolean).join("\n\n");
}

export const TECHNICIAN_NOTE = `## No shell here
Bash is not available in this app: you cannot run a snippet, install a driver, or reach any external system from here. Write the skill and the self-verifying snippet as your definition says, and state plainly in your handover that everything was written and nothing was run. Never invent a result you did not observe.`;
