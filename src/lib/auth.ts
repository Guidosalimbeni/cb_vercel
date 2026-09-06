import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { config } from "./config";

export const COOKIE = "cb_session";

export function authEnabled(): boolean {
  return !!config.password;
}

export function sessionToken(): string {
  return createHmac("sha256", config.password || "open").update("cb-session-v1").digest("hex");
}

export async function isAuthed(): Promise<boolean> {
  if (!authEnabled()) return true;
  const jar = await cookies();
  return jar.get(COOKIE)?.value === sessionToken();
}

/** For API routes: returns a 401 response when not signed in, else null. */
export async function requireAuth(): Promise<Response | null> {
  return (await isAuthed()) ? null : Response.json({ error: "unauthorized" }, { status: 401 });
}
