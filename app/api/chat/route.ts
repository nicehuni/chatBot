import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchDocuments } from "@/lib/retrieval";
import { generateAnswer } from "@/lib/answer";
import type { Turn } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  let input;
  try {
    const raw = await request.text();
    if (raw.length > 10000) throw new Error("Request too large");
    input = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "질문 형식을 확인해 주세요." }, { status: 400 });
  }
  if (!input || typeof input.question !== "string" || !input.question.trim() || input.question.length > 4000
    || typeof input.roomId !== "string" || !uuid.test(input.roomId)
    || typeof input.turnId !== "string" || !uuid.test(input.turnId)) {
    return NextResponse.json({ error: "질문은 1~4,000자로 입력해 주세요." }, { status: 400 });
  }
  const { roomId, turnId } = input;
  const question = input.question.trim();
  const { data: started, error: startError } = await supabase.rpc("begin_chat_turn", {
    p_room_id: roomId, p_turn_id: turnId, p_question: question,
  });
  if (startError) {
    const conflict = startError.code === "55P03";
    return NextResponse.json({ error: conflict ? "이 대화의 답변을 생성 중입니다. 잠시 후 다시 시도해 주세요." : "대화를 저장할 수 없습니다. 채팅방을 확인해 주세요." }, { status: conflict ? 409 : 403 });
  }
  const turn = started as Turn;
  if (turn.status === "completed") return NextResponse.json({ turn });

  try {
    const { data: previous, error: historyError } = await supabase.from("chat_turns").select("question,answer")
      .eq("room_id", roomId).eq("status", "completed").lt("created_at", turn.created_at)
      .order("created_at", { ascending: false }).limit(8);
    if (historyError) throw new Error("이전 대화를 불러오지 못했습니다.");
    const history = (previous ?? []).reverse().flatMap((item) => [
      { role: "user" as const, content: item.question },
      { role: "assistant" as const, content: item.answer ?? "" },
    ]);
    const documents = await searchDocuments(supabase, question, history.filter((item) => item.role === "user").at(-1)?.content.slice(0, 500));
    const result = await generateAnswer(history, question, documents);
    const { data: saved, error: saveError } = await supabase.from("chat_turns")
      .update({ answer: result.answer, sources: result.sources, status: "completed", completed_at: new Date().toISOString(), error_message: null })
      .eq("id", turnId).eq("room_id", roomId).select("*").single();
    if (saveError) throw new Error("답변 저장에 실패했습니다. 다시 시도해 주세요.");
    return NextResponse.json({ turn: saved });
  } catch (caught) {
    console.error("Chat request failed", caught instanceof Error ? caught.message : "Unknown error");
    const error = "답변을 준비하지 못했어요. 잠시 후 ‘답변 다시 받기’를 눌러 주세요.";
    await supabase.from("chat_turns").update({ status: "failed", error_message: error }).eq("id", turnId).eq("status", "pending");
    return NextResponse.json({ error }, { status: 502 });
  }
}
