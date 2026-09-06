import { test } from "node:test";
import assert from "node:assert/strict";
import { Repo } from "../src/lib/repo";
import { LocalStore } from "../src/lib/store";
import { loadAgents, loadCommands, loadSkills, expandCommand } from "../src/lib/definitions";
import { buildMainSystem, buildSubagentSystem } from "../src/lib/prompts";
import { toolNamesFromAllowlist } from "../src/lib/tools";

async function repo(): Promise<Repo> {
  const store = new LocalStore(process.cwd());
  return new Repo(await store.load(), store);
}

test("the real .claude/ definitions load", async () => {
  const r = await repo();
  const commands = loadCommands(r);
  assert.deepEqual(
    commands.map((c) => c.name),
    ["cb_ask", "cb_close", "cb_dag", "cb_ingest", "cb_method", "cb_notebook", "cb_outcome", "cb_report", "cb_result", "cb_review", "cb_scholar", "cb_status", "cb_tech"],
  );
  assert.equal(commands.find((c) => c.name === "cb_ask")!.argumentHint, "<what they said, verbatim>");
  const agents = loadAgents(r);
  assert.deepEqual(agents.map((a) => a.name), ["interviewer", "librarian", "reviewer", "scholar", "technician"]);
  assert.deepEqual(agents.find((a) => a.name === "reviewer")!.tools, ["Read", "Grep", "Glob"]);
  assert.deepEqual(toolNamesFromAllowlist(agents.find((a) => a.name === "reviewer")!.tools), ["read_file", "list_directory", "glob", "grep", "load_skill"]);
  assert.deepEqual(toolNamesFromAllowlist(agents.find((a) => a.name === "technician")!.tools), ["read_file", "list_directory", "glob", "grep", "load_skill", "write_file", "edit_file"]);
  const skills = loadSkills(r);
  assert.equal(skills.filter((s) => s.standing === "trusted").length, 7);
});

test("$ARGUMENTS substitution and system prompts", async () => {
  const r = await repo();
  const ask = loadCommands(r).find((c) => c.name === "cb_ask")!;
  assert.match(expandCommand(ask, "did the price change drive churn?"), /^A question is opening\. Verbatim, this is what was asked:\n\ndid the price change drive churn\?/);
  const status = loadCommands(r).find((c) => c.name === "cb_status")!;
  assert.equal(expandCommand(status, ""), status.body);
  const sys = buildMainSystem(r, { skills: loadSkills(r), agents: loadAgents(r), commandNames: ["cb_ask"], codeExecution: false });
  assert.match(sys, /# cb — a causal companion/);
  assert.match(sys, /invoke_subagent/);
  assert.match(sys, /`running-an-interview`/);
  const sub = buildSubagentSystem(r, loadAgents(r).find((a) => a.name === "reviewer")!, loadSkills(r));
  assert.match(sub, /You are the `reviewer` subagent/);
  assert.match(sub, /You do not see the interview/);
});
