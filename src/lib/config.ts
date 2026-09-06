export type Effort = "low" | "medium" | "high";

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const config = {
  model: process.env.CB_MODEL || "claude-sonnet-5",
  effort: ((process.env.CB_EFFORT as Effort) || "medium") as Effort,
  showThinking: process.env.CB_SHOW_THINKING === "1",
  github: {
    token: process.env.GITHUB_TOKEN || "",
    repo: process.env.GITHUB_REPO || "",
    branch: process.env.GITHUB_BRANCH || "main",
  },
  localRepo: process.env.CB_LOCAL_REPO || "",
  password: process.env.APP_PASSWORD || "",
  runBudgetMs: num(process.env.CB_RUN_BUDGET_SECONDS, 240) * 1000,
  /** Hard cap on API rounds per agent loop, a guard against runaway loops. */
  maxRounds: num(process.env.CB_MAX_ROUNDS, 60),
};

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
