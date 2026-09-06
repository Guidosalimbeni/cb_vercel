import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { UploadForm } from "./form";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  if (!(await isAuthed())) redirect("/login");
  return <UploadForm />;
}
