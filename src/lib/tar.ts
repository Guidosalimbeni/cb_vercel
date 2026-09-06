/**
 * Minimal tar reader, enough for GitHub tarballs (git archive output: ustar
 * headers, a pax global header, and pax extended headers for long paths).
 */
export function parseTar(buf: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  let off = 0;
  let paxPath: string | null = null;
  let gnuLongName: string | null = null;

  const cstr = (h: Buffer, start: number, len: number) => {
    const slice = h.subarray(start, start + len);
    const end = slice.indexOf(0);
    return slice.subarray(0, end === -1 ? len : end).toString("utf8");
  };

  while (off + 512 <= buf.length) {
    const header = buf.subarray(off, off + 512);
    let empty = true;
    for (let i = 0; i < 512; i++) {
      if (header[i] !== 0) {
        empty = false;
        break;
      }
    }
    if (empty) break;

    const name = cstr(header, 0, 100);
    const sizeStr = cstr(header, 124, 12).trim();
    const size = sizeStr ? parseInt(sizeStr, 8) : 0;
    const type = String.fromCharCode(header[156]);
    const prefix = cstr(header, 345, 155);
    const data = buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;

    if (type === "L") {
      gnuLongName = data.toString("utf8").replace(/\0+$/, "");
      continue;
    }
    if (type === "x") {
      paxPath = parsePaxPath(data.toString("utf8"));
      continue;
    }
    if (type === "g") continue; // pax global header

    const full = gnuLongName ?? paxPath ?? (prefix ? `${prefix}/${name}` : name);
    gnuLongName = null;
    paxPath = null;

    if (type === "0" || type === "\0" || type === "") {
      files.set(full, Buffer.from(data));
    }
  }
  return files;
}

function parsePaxPath(text: string): string | null {
  let pos = 0;
  while (pos < text.length) {
    const sp = text.indexOf(" ", pos);
    if (sp === -1) break;
    const len = parseInt(text.slice(pos, sp), 10);
    if (!Number.isFinite(len) || len <= 0) break;
    const record = text.slice(sp + 1, pos + len);
    const eq = record.indexOf("=");
    if (eq !== -1) {
      const key = record.slice(0, eq);
      const value = record.slice(eq + 1).replace(/\n$/, "");
      if (key === "path") return value;
    }
    pos += len;
  }
  return null;
}
