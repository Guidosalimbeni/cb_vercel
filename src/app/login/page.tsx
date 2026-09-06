"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const router = useRouter();
  return (
    <div className="login">
      <h2 style={{ marginTop: 0 }}>cb · sign in</h2>
      <p className="hint">Shared password for this demo.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
          if (r.ok) {
            router.push("/");
            router.refresh();
          } else setErr("Wrong password");
        }}
      >
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="password" style={{ width: "100%" }} autoFocus />
        {err ? <p style={{ color: "var(--red)" }}>{err}</p> : null}
        <div style={{ marginTop: 10 }}>
          <button className="primary" type="submit">Enter</button>
        </div>
      </form>
    </div>
  );
}
