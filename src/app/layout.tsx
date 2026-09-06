import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { authEnabled } from "@/lib/auth";
import { config } from "@/lib/config";
import { LogoutButton } from "./logout-button";

export const metadata: Metadata = { title: "cb — causal brain", description: "A causal companion, on the web" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const repo = config.localRepo ? config.localRepo : config.github.repo;
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <Link href="/" className="brand">cb · causal brain</Link>
          <Link href="/">Console</Link>
          <Link href="/browse?path=wiki">Wiki</Link>
          <Link href="/dag">DAG</Link>
          <Link href="/browse?path=.claude/SKILLS.md">Skills</Link>
          <Link href="/upload">Upload</Link>
          <span className="spacer" />
          <span className="muted mono">{repo ? repo : "no repo configured"} · {config.model}</span>
          {authEnabled() ? <LogoutButton /> : null}
        </nav>
        {children}
      </body>
    </html>
  );
}
