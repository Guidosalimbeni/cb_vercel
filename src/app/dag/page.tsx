import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { DagView } from "./view";

export const dynamic = "force-dynamic";

export default async function DagPage() {
  if (!(await isAuthed())) redirect("/login");
  return <DagView />;
}
