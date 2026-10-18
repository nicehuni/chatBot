export const EMBEDDING_DIMENSIONS = 1024;

export async function embedTexts(texts: string[], kind: "query" | "passage") {
  const key = process.env.UPSTAGE_API_KEY;
  if (!key) throw new Error("UPSTAGE_API_KEY가 설정되지 않았습니다.");
  const response = await fetch("https://api.upstage.ai/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: `solar-embedding-2-${kind}`, input: texts }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`문서 임베딩 요청에 실패했습니다. (${response.status})`);
  const result = await response.json();
  const data = result.data as { index: number; embedding: number[] }[];
  if (!Array.isArray(data) || data.length !== texts.length) throw new Error("임베딩 응답을 확인하지 못했습니다.");
  const vectors = data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
  if (vectors.some((vector) => vector.length !== EMBEDDING_DIMENSIONS || vector.some((v) => !Number.isFinite(v)))) {
    throw new Error("임베딩 차원이 데이터베이스 설정과 다릅니다.");
  }
  return vectors;
}
