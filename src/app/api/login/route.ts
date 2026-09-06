import { cookies } from "next/headers";
import { COOKIE, authEnabled, sessionToken } from "@/lib/auth";
import { config } from "@/lib/config";

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { password?: string };
  if (authEnabled() && body.password !== config.password) return Response.json({ error: "wrong password" }, { status: 401 });
  const jar = await cookies();
  jar.set(COOKIE, sessionToken(), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 14, secure: process.env.NODE_ENV === "production" });
  return Response.json({ ok: true });
}
