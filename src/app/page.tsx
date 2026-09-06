import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { Console } from "./console";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!(await isAuthed())) redirect("/login");
  return <Console />;
}
