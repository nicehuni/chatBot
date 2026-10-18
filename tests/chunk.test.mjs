import test from "node:test";
import assert from "node:assert/strict";
import { chunkPages } from "../scripts/chunk.mjs";

test("page-aware chunks preserve all text with overlap and original page numbers", () => {
  const page = "가나다라마바사아자차".repeat(200);
  const chunks = chunkPages([{ num: 7, text: page }]);
  assert.ok(chunks.every((c) => c.page === 7 && c.content.length <= 900));
  let reconstructed = chunks[0].content;
  for (let i = 1; i < chunks.length; i++) {
    assert.equal(chunks[i - 1].content.slice(-140), chunks[i].content.slice(0, 140));
    reconstructed += chunks[i].content.slice(140);
  }
  assert.equal(reconstructed, page);
});
test("empty pages do not shift source page numbers; indexes are unique", () => {
  const result = chunkPages([{ num: 1, text: " " }, { num: 2, text: "연구개발 목표" }, { num: 3, text: "연구\t 일정" }]);
  assert.deepEqual(result.map((c) => [c.chunk_index, c.page, c.content]), [[0, 2, "연구개발 목표"], [1, 3, "연구 일정"]]);
});
test("invalid overlap cannot cause an infinite loop", () => {
  assert.throws(() => chunkPages([], 100, 100));
});
