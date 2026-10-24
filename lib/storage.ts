import "server-only";
import { put, list, get, del, head } from "@vercel/blob";
import { promises as fs } from "fs";
import path from "path";
import { emptyState, type AppState } from "./types";

const ACCESS = (process.env.BLOB_ACCESS as "public" | "private") || "private";
const hasBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;
const LOCAL_DIR = path.join(process.cwd(), ".localdata");
const STATE_PATH = "state/state.json";

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function readBlob(pathname: string): Promise<{ buf: Buffer; etag: string } | null> {
  if (!hasBlob()) {
    try {
      const buf = await fs.readFile(path.join(LOCAL_DIR, pathname));
      return { buf, etag: String(buf.length) + ":" + buf.subarray(0, 64).toString("hex") };
    } catch {
      return null;
    }
  }
  try {
    const res = await get(pathname, { access: ACCESS, useCache: false });
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    const buf = await streamToBuffer(res.stream);
    // the etag accepted by put({ ifMatch }) is the one from the API metadata, not the CDN header
    let etag = "";
    try {
      etag = (await head(pathname)).etag;
    } catch {}
    return { buf, etag };
  } catch (e: any) {
    if (/not.?found/i.test(String(e?.message ?? e)) || e?.name === "BlobNotFoundError") return null;
    throw e;
  }
}

async function writeBlob(
  pathname: string,
  body: Buffer | string,
  contentType: string,
  ifMatch?: string
): Promise<void> {
  if (!hasBlob()) {
    const p = path.join(LOCAL_DIR, pathname);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, body);
    return;
  }
  await put(pathname, body, {
    access: ACCESS,
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType,
    cacheControlMaxAge: 60,
    ...(ifMatch ? { ifMatch } : {}),
  });
}

// ---------- App state (logs) ----------

export async function readJsonCache<T>(name: string): Promise<T | null> {
  const r = await readBlob(`cache/${name}.json`).catch(() => null);
  if (!r) return null;
  try {
    return JSON.parse(r.buf.toString("utf8")) as T;
  } catch {
    return null;
  }
}

export async function writeJsonCache(name: string, data: unknown): Promise<void> {
  await writeBlob(`cache/${name}.json`, JSON.stringify(data), "application/json").catch(() => {});
}

export async function readState(): Promise<{ state: AppState; etag: string | null }> {
  const r = await readBlob(STATE_PATH);
  if (!r) return { state: emptyState(), etag: null };
  const parsed = JSON.parse(r.buf.toString("utf8")) as AppState;
  return { state: { ...emptyState(), ...parsed }, etag: r.etag || null };
}

export async function updateState(mutate: (s: AppState) => void): Promise<AppState> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { state, etag } = await readState();
    mutate(state);
    state.updatedAt = new Date().toISOString();
    // last attempt: single user app, better to save than to fail
    const ifMatch = attempt < 3 && etag ? etag : undefined;
    try {
      await writeBlob(STATE_PATH, JSON.stringify(state), "application/json", ifMatch);
      return state;
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (!/precondition|etag|412|conflict/i.test(msg)) throw e;
      await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
    }
  }
  throw new Error("Salvataggio in conflitto, riprova");
}

// ---------- Workbook (the trainer's Excel) ----------

export type WorkbookInfo = { buf: Buffer; source: string; uploadedAt: string | null; key: string };

export async function readWorkbook(): Promise<WorkbookInfo> {
  if (hasBlob()) {
    const { blobs } = await list({ prefix: "sheets/" });
    const latest = blobs.sort((a, b) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt))[0];
    if (latest) {
      const r = await readBlob(latest.pathname);
      if (r) {
        const name = latest.pathname.replace(/^sheets\/\d+-/, "");
        return { buf: r.buf, source: name, uploadedAt: new Date(latest.uploadedAt).toISOString(), key: latest.etag };
      }
    }
  } else {
    try {
      const files = (await fs.readdir(path.join(LOCAL_DIR, "sheets"))).sort().reverse();
      if (files[0]) {
        const buf = await fs.readFile(path.join(LOCAL_DIR, "sheets", files[0]));
        return { buf, source: files[0].replace(/^\d+-/, ""), uploadedAt: null, key: files[0] };
      }
    } catch {}
  }
  const buf = await fs.readFile(path.join(process.cwd(), "data", "scheda.xlsx"));
  return { buf, source: "scheda.xlsx", uploadedAt: null, key: `bundled-${process.env.VERCEL_DEPLOYMENT_ID ?? buf.length}` };
}

export async function saveWorkbook(name: string, buf: Buffer): Promise<void> {
  const safe = name.replace(/[^\w.\-]+/g, "_").slice(-80);
  await writeBlob(
    `sheets/${Date.now()}-${safe}`,
    buf,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  // keep only the 5 most recent uploads
  if (hasBlob()) {
    const { blobs } = await list({ prefix: "sheets/" });
    const old = blobs.sort((a, b) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt)).slice(5);
    if (old.length) await del(old.map((b) => b.url));
  }
}
