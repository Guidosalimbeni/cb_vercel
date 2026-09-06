# cb on the web

The causal brain (`wiki/` + `.claude/` commands, agents and skills) as a small web app: the same
slash commands and the same subagent architecture, driven by the Anthropic API instead of the
Claude Code CLI, with a GitHub repository as the filesystem.

- **Storage**: every read comes from one tarball fetch of the content repo per run, served from
  memory; every write is one commit via the GitHub contents API, authored `cb/<agent>`.
- **Orchestration**: `.claude/commands/<name>.md` is the user turn, `CLAUDE.md` plus platform notes
  is the system prompt, `invoke_subagent` runs `.claude/agents/<name>.md` in an isolated loop with
  only the tools its frontmatter allows, `load_skill` reads `.claude/skills*/<name>/SKILL.md`.
- **State**: one thread per question, saved as `.cb/threads/<id>.json` in the content repo after
  every turn. Agents cannot read `.cb/`, so the reviewer and librarian never see the conversation.
  Subagent conversations are saved too, so the interviewer resumes with memory across exchanges.
- **DAG tab**: `wiki/concepts/*.md` parsed into an interactive graph. `## Caused by` and `## Causes`
  become arrows, `## Computed from` dotted arithmetic edges, a missing `{by:... on:...}` span a
  dashed edge, `observed: false` a hollow node; filter by `graphs:`, click a node for its fields,
  reasoning and ancestry.
- **Pause and wait**: a turn ends when the main agent stops calling tools; the UI shows its text and
  waits. Runs that hit the time budget pause with consistent state and offer a Continue button.

## Layout

```
src/lib/store.ts         GitHub (tarball read, contents-API write) and local-git stores
src/lib/repo.ts          in-memory repo: read, list, glob, grep, write-through
src/lib/tools.ts         read_file, write_file, edit_file, list_directory, glob, grep, load_skill
src/lib/runner.ts        the streaming tool-use loop
src/lib/orchestrator.ts  a turn: command routing, main agent, invoke_subagent, state
src/lib/threads.ts       thread state in .cb/threads/
src/lib/prompts.ts       system prompts for main and subagents
src/lib/dag.ts           concept-file parser and layered layout for the DAG tab
src/app/                 console, browse, upload, login, API routes
scripts/seed.ts          push wiki/, .claude/, raw/, CLAUDE.md into an empty content repo
test/                    unit tests plus a scripted end-to-end run against a scratch git repo
```

The scaffold in this repo (`wiki/`, `.claude/`, `raw/`, `CLAUDE.md`) is the seed. The app itself
reads and writes the content repo named in `GITHUB_REPO`, so prompts can be edited there without a
redeploy.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in ANTHROPIC_API_KEY, GITHUB_TOKEN, GITHUB_REPO, APP_PASSWORD
npm run dev                  # http://localhost:3000
```

For a local content checkout instead of GitHub, set `CB_LOCAL_REPO=/path/to/clone`; writes become
local git commits. `CB_FAKE_MODEL=1` replaces the model with a canned one that reads one file and
answers, to check the plumbing without an API key.

```bash
npm test          # unit + scripted end-to-end tests
npm run typecheck
npm run build
```

## Deploy on Vercel

1. Create the content repo (public or private) and seed it: either push `wiki/`, `.claude/`,
   `raw/` and `CLAUDE.md` yourself, or run `GITHUB_TOKEN=... GITHUB_REPO=owner/name npm run seed`.
2. Create a fine-grained GitHub personal access token scoped to that repo only, with
   **Contents: read and write** and **Metadata: read**.
3. In Vercel, **Add New Project** and import this repo. Framework preset: Next.js. Before the first
   deploy, open **Environment Variables** and add:

   | name | value |
   |---|---|
   | `ANTHROPIC_API_KEY` | your key |
   | `GITHUB_TOKEN` | the fine-grained token |
   | `GITHUB_REPO` | `owner/name` of the content repo |
   | `GITHUB_BRANCH` | `main` |
   | `APP_PASSWORD` | the shared password for your friends |
   | `CB_MODEL` | `claude-sonnet-5` (default) |
   | `CB_RUN_BUDGET_SECONDS` | `240` (default; stay under the plan's function limit) |

4. Deploy. On the Hobby plan a function may run for up to 300 s with Fluid Compute (on by default
   for new projects); the run route declares `maxDuration = 300` and pauses itself at the budget.

## What differs from the CLI

- No Bash. Prompts that say `rg` or `grep -rn` are served by the `grep` tool. The technician is told
  it cannot run anything and must say so in its handover.
- `run_here: true` is served by Anthropic's server-side code execution tool, offered to the main
  agent on `/cb_dag`, `/cb_notebook` and `/cb_result` only. The sandbox has a fixed package set.
- `glob` sorts by path, not modification time.
- Uploads (`raw/`, `wiki/questions/<qid>/data/`, `.../result/`) go through the Upload page; agents
  cannot write to `raw/`.
