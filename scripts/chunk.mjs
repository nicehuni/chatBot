export function chunkPages(pages, size = 900, overlap = 140) {
  if (size <= overlap || overlap < 0) throw new Error("Invalid chunk size");
  const chunks = [];
  for (const page of pages) {
    const text = page.text.normalize("NFC").replace(/\r/g, "").replace(/[\t ]+/g, " ").trim();
    for (let start = 0; start < text.length;) {
      let end = Math.min(start + size, text.length);
      if (end < text.length) {
        const boundary = text.lastIndexOf("\n", end);
        if (boundary > start + size / 2) end = boundary;
      }
      const content = text.slice(start, end).trim();
      if (content) chunks.push({ chunk_index: chunks.length, page: page.num, content });
      if (end === text.length) break;
      start = end - overlap;
    }
  }
  return chunks;
}
