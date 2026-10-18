import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join, relative, extname } from "node:path";
import { createHash } from "node:crypto";
import { PDFParse } from "pdf-parse";
import { createClient } from "@supabase/supabase-js";
import { embedTexts } from "../lib/embeddings.ts";
import { chunkPages } from "./chunk.mjs";

const prepareOnly = process.argv.includes("--prepare-only");
const root = join(process.cwd(), "dataset");
const cache = join(process.cwd(), ".rag-cache");
await mkdir(cache, { recursive: true });
const supabase = prepareOnly ? null : createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function filesAt(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory() ? filesAt(join(dir, entry.name)) : join(dir, entry.name)));
  return nested.flat().filter((file) => [".pdf", ".txt", ".md"].includes(extname(file).toLowerCase()));
}
const files = await filesAt(root);
if (!files.length) throw new Error("dataset에 PDF, TXT, MD 문서를 넣어 주세요.");
for (const file of files) {
  const bytes = await readFile(file);
  const sourcePath = relative(root, file).normalize("NFC");
  const hash = createHash("sha256").update(bytes).update("solar-embedding-2:900:140:v1").digest("hex");
  const idHash = createHash("sha256").update(sourcePath + hash).digest("hex").slice(0, 32);
  const id = `${idHash.slice(0, 8)}-${idHash.slice(8, 12)}-${idHash.slice(12, 16)}-${idHash.slice(16, 20)}-${idHash.slice(20)}`;
  const cacheFile = join(cache, `${id}.json`);
  let prepared;
  try { prepared = JSON.parse(await readFile(cacheFile, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (!prepared) {
    let pages;
    if (extname(file).toLowerCase() === ".pdf") {
      const parser = new PDFParse({ data: bytes });
      try { pages = (await parser.getText()).pages; } finally { await parser.destroy(); }
    } else {
      pages = [{ num: 1, text: bytes.toString("utf8") }];
    }
    const chunks = chunkPages(pages);
    if (!chunks.length) throw new Error(`${sourcePath}: 추출할 텍스트가 없습니다. OCR이 필요합니다.`);
    for (let offset = 0; offset < chunks.length; offset += 32) {
      const batch = chunks.slice(offset, offset + 32);
      const vectors = await embedTexts(batch.map((chunk) => chunk.content), "passage");
      batch.forEach((chunk, i) => { chunk.embedding = vectors[i]; });
      console.log(`임베딩 ${Math.min(offset + 32, chunks.length)}/${chunks.length}`);
    }
    prepared = {
      document: { id, name: sourcePath, source_path: sourcePath, content_hash: hash, page_count: pages.length },
      pages: pages.map((page) => ({ document_id: id, page: page.num, content: page.text })),
      chunks: chunks.map((chunk) => ({ ...chunk, document_id: id })),
    };
    await writeFile(cacheFile, JSON.stringify(prepared));
  }
  if (supabase) {
    const check = ({ error }) => { if (error) throw error; };
    check(await supabase.from("documents").upsert(prepared.document, { onConflict: "id" }));
    for (let i = 0; i < prepared.pages.length; i += 25) check(await supabase.from("document_pages").upsert(prepared.pages.slice(i, i + 25)));
    for (let i = 0; i < prepared.chunks.length; i += 25) check(await supabase.from("document_chunks").upsert(prepared.chunks.slice(i, i + 25), { onConflict: "document_id,chunk_index" }));
    check(await supabase.rpc("activate_document", { p_id: id, p_chunk_count: prepared.chunks.length }));
  }
  console.log(JSON.stringify({ document: sourcePath, pages: prepared.pages.length, chunks: prepared.chunks.length, cacheFile, imported: !!supabase }));
}
