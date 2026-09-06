"use client";
import { marked } from "marked";
import { useMemo } from "react";

marked.setOptions({ gfm: true, breaks: false });

export function Markdown({ text }: { text: string }) {
  const html = useMemo(() => marked.parse(text ?? "") as string, [text]);
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}
