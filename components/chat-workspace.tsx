"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Room, Turn } from "@/lib/types";

const suggestions = ["연구개발계획서의 핵심 목표를 요약해 줘", "연구 일정과 단계별 목표를 알려줘", "이 문서의 주요 참여 기관은 어디야?"];
const timestamp = (date: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(date));

function FormattedMessage({ content }: { content: string }) {
  return <Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
    a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
    table: ({ children }) => <div className="table-scroll"><table>{children}</table></div>,
  }}>{content}</Markdown>;
}

export function ChatWorkspace({ profile, initialRooms, initialError }: {
  profile: { name: string; avatar: string }; initialRooms: Room[]; initialError: string;
}) {
  const router = useRouter();
  const [rooms, setRooms] = useState(initialRooms);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingRoom, setLoadingRoom] = useState(false);
  const [error, setError] = useState(initialError);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const requestLock = useRef(false);
  const roomRequest = useRef(0);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [turns, busy]);

  async function loadRoom(id: string) {
    if (requestLock.current) return;
    const request = ++roomRequest.current;
    setLoadingRoom(true);
    setSidebarOpen(false);
    setError("");
    const { data, error } = await createClient().from("chat_turns").select("*").eq("room_id", id).order("created_at");
    if (roomRequest.current !== request) return;
    if (error) setError("이 대화를 불러오지 못했어요. 다시 선택해 주세요.");
    else { setTurns(data as Turn[]); setRoomId(id); }
    setLoadingRoom(false);
  }

  function newRoom() {
    if (requestLock.current) return;
    roomRequest.current++;
    setLoadingRoom(false);
    setRoomId(null);
    setTurns([]);
    setInput("");
    setError("");
    setSidebarOpen(false);
    textareaRef.current?.focus();
  }

  async function send(text = input, retry?: Turn) {
    const question = text.trim();
    if (!question || requestLock.current || loadingRoom) return;
    requestLock.current = true;
    setBusy(true);
    setError("");
    const id = roomId ?? crypto.randomUUID();
    const turnId = retry?.id ?? crypto.randomUUID();
    const now = new Date().toISOString();
    setRoomId(id);
    const optimistic: Turn = { id: turnId, room_id: id, question, answer: null, sources: [], status: "pending", error_message: null, created_at: retry?.created_at ?? now, completed_at: null };
    setTurns((current) => retry ? current.map((turn) => turn.id === retry.id ? optimistic : turn) : [...current, optimistic]);
    setInput("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: id, turnId, question }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401) { router.replace("/"); router.refresh(); }
        throw new Error(data.error || "답변을 가져오지 못했어요.");
      }
      setTurns((current) => current.map((turn) => turn.id === turnId ? data.turn : turn));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "연결을 확인하고 다시 시도해 주세요.";
      setError(message);
      setTurns((current) => current.map((turn) => turn.id === turnId ? { ...turn, status: "failed", error_message: message } : turn));
    } finally {
      const { data } = await createClient().from("chat_rooms").select("id,title,created_at,updated_at").order("updated_at", { ascending: false });
      if (data) setRooms(data);
      requestLock.current = false;
      setBusy(false);
      textareaRef.current?.focus();
    }
  }

  async function logout() {
    if (requestLock.current) return;
    const { error } = await createClient().auth.signOut({ scope: "local" });
    if (error) { setError("로그아웃하지 못했어요. 다시 시도해 주세요."); return; }
    router.replace("/");
    router.refresh();
  }

  function submit(event: FormEvent) { event.preventDefault(); void send(); }
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
      event.preventDefault(); void send();
    }
  }

  return <main className="workspace">
    {sidebarOpen && <button className="sidebar-scrim" aria-label="대화 목록 닫기" onClick={() => setSidebarOpen(false)} />}
    <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
      <Link href="/chat" className="logo"><span className="brand-mark">✦</span>(주)성원 RAG기반 AI</Link>
      <button className="new-chat" onClick={newRoom} disabled={busy}>＋ 새 대화<span>↗</span></button>
      <div className="sidebar-label">나의 대화 <span>{rooms.length}</span></div>
      <nav className="room-list" aria-label="저장된 채팅방">
        {rooms.length === 0 && <p className="rooms-empty">첫 질문을 남겨보세요.<br />대화가 여기에 저장돼요.</p>}
        {rooms.map((room) => <button key={room.id} className={room.id === roomId ? "selected" : ""} disabled={busy} onClick={() => void loadRoom(room.id)}>
          <span>◌</span><div><strong>{room.title}</strong><time dateTime={room.created_at}>{timestamp(room.created_at)}</time></div>
        </button>)}
      </nav>
      <div className="profile">
        {profile.avatar ? /* eslint-disable-next-line @next/next/no-img-element */
          <img src={profile.avatar} alt="" width={36} height={36} referrerPolicy="no-referrer" /> : <span className="profile-fallback">{profile.name[0]}</span>}
        <div><strong>{profile.name}</strong><small>나만의 지식 공간</small></div>
        <button onClick={logout} disabled={busy} title="로그아웃" aria-label="로그아웃">↪</button>
      </div>
    </aside>
    <div className="chat-main">
      <header className="chat-header"><button className="mobile-menu" aria-label="대화 목록 열기" onClick={() => setSidebarOpen(true)}>☰</button><div><strong>{rooms.find((room) => room.id === roomId)?.title || "새 대화"}</strong><small>문서를 이해하고, 함께 생각하는 공간</small></div><span className="document-badge">▤ 문서 기반 답변</span></header>
      <section className="chat-scroll" aria-live="polite" aria-label="대화 내용">
        {loadingRoom ? <p className="room-loading">대화를 불러오고 있어요…</p> : turns.length === 0 ? <div className="chat-welcome">
          <div className="welcome-mark">✦</div><p className="eyebrow">YOUR KNOWLEDGE COMPANION</p>
          <h1>{profile.name}님, 반가워요.<br /><span>문서에 무엇을 물어볼까요?</span></h1>
          <p>연구개발계획서를 바탕으로 답하고, 참고한 페이지도 함께 알려드려요.</p>
          <div className="suggestions">{suggestions.map((suggestion) => <button key={suggestion} onClick={() => void send(suggestion)}>{suggestion}<span>↗</span></button>)}</div>
        </div> : <div className="message-list">
          {turns.map((turn) => <div key={turn.id} className="turn">
            <article className="message-row user"><div className="message-body"><div className="message-content">{turn.question}</div><time className="message-time" dateTime={turn.created_at}>{timestamp(turn.created_at)}</time></div></article>
            <article className="message-row assistant"><div className="avatar">✦</div><div className="message-body"><div className="message-author">(주)성원 RAG기반 AI</div>
              {turn.answer ? <><div className="message-content"><FormattedMessage content={turn.answer} /></div>
                {turn.sources?.length > 0 && <div className="sources"><div className="sources-label">참고한 자료 · {turn.sources.length}</div>
                  {turn.sources.map((source, index) => <details className="source-detail" key={`${source.title}-${source.page}-${index}`}><summary><span>{index + 1}</span>{source.type === "document" ? "▤" : "↗"} {source.title}{source.page && <b>{source.page}쪽</b>}</summary>
                    {source.excerpt && <p>{source.excerpt}</p>}{source.url && <a href={source.url} target="_blank" rel="noreferrer">원문 보기 ↗</a>}
                  </details>)}
                </div>}
                {turn.completed_at && <time className="message-time" dateTime={turn.completed_at}>{timestamp(turn.completed_at)}</time>}
              </> : busy && turn.status === "pending" ? <div className="thinking"><span /><span /><span /><small>문서를 살펴보고 답변을 준비하고 있어요</small></div> : <div className="turn-error"><p>{turn.error_message || "아직 완료되지 않은 답변입니다."}</p><button disabled={busy} onClick={() => void send(turn.question, turn)}>답변 다시 받기 ↻</button></div>}
            </div></article>
          </div>)}<div ref={endRef} />
        </div>}
      </section>
      <div className="composer-wrap">
        {error && <div className="error-message" role="alert">{error}</div>}
        <form className="composer" onSubmit={submit}><textarea ref={textareaRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={keyDown} placeholder="문서에 대해 궁금한 점을 물어보세요" rows={2} maxLength={4000} aria-label="질문 입력" disabled={loadingRoom} /><button type="submit" disabled={busy || loadingRoom || !input.trim()} aria-label="질문 보내기">↑</button></form>
        <p className="disclaimer">답변의 근거는 참고 자료에서 확인하세요. · Enter 전송 / Shift + Enter 줄바꿈</p>
      </div>
    </div>
  </main>;
}
