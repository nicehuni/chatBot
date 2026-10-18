"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

type Source = { title: string; url: string };
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

const suggestions = [
  "오늘 주요 AI 뉴스를 알려줘",
  "초보자를 위한 운동 루틴을 짜줘",
  "복잡한 내용을 쉽게 설명해 줘",
];

function SparkleIcon({ small = false }: { small?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={small ? "icon-small" : "icon"}>
      <path d="M12 2.8c.5 4.9 3.2 7.7 8.2 8.2-5 .5-7.7 3.3-8.2 8.2-.5-4.9-3.2-7.7-8.2-8.2 5-.5 7.7-3.3 8.2-8.2Z" />
      <path d="M19 2.5c.2 1.7 1.1 2.7 2.8 2.9-1.7.2-2.6 1.1-2.8 2.8-.2-1.7-1.1-2.6-2.8-2.8 1.7-.2 2.6-1.2 2.8-2.9Z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6.5 12 5.5-5.5 5.5 5.5M12 7v10.5" />
    </svg>
  );
}

function FormattedMessage({ content }: { content: string }) {
  return content.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : part,
  );
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function resizeTextarea() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }

  async function sendMessage(text = input) {
    const question = text.trim();
    if (!question || loading) return;

    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: question };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setError("");
    setLoading(true);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "답변을 불러오지 못했어요.");

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.answer,
          sources: data.sources,
        },
      ]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void sendMessage();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark"><SparkleIcon /></div>
        <div>
          <div className="brand-name">모두의 AI</div>
          <div className="brand-caption">누구나 편하게, 무엇이든 물어보세요</div>
        </div>
        <div className="status"><span /> 온라인</div>
      </header>

      <section className={`conversation ${messages.length === 0 ? "is-empty" : ""}`} aria-live="polite">
        {messages.length === 0 ? (
          <div className="welcome">
            <div className="welcome-mark"><SparkleIcon /></div>
            <p className="eyebrow">당신을 위한 AI 어시스턴트</p>
            <h1>안녕하세요!<br /><span>무엇을 도와드릴까요?</span></h1>
            <p className="welcome-copy">궁금한 것을 물어보거나, 아이디어를 함께 발전시켜 보세요.<br />최신 정보가 필요하면 웹을 찾아 정확하게 답해드려요.</p>
            <div className="suggestions">
              {suggestions.map((suggestion) => (
                <button key={suggestion} onClick={() => void sendMessage(suggestion)}>{suggestion}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="message-list">
            {messages.map((message) => (
              <article key={message.id} className={`message-row ${message.role}`}>
                {message.role === "assistant" && <div className="avatar"><SparkleIcon small /></div>}
                <div className="message-body">
                  {message.role === "assistant" && <div className="message-author">모두의 AI</div>}
                  <div className="message-content"><FormattedMessage content={message.content} /></div>
                  {message.sources && message.sources.length > 0 && (
                    <div className="sources">
                      <div className="sources-label"><span>⌕</span> 참고한 웹 자료</div>
                      <div className="source-list">
                        {message.sources.map((source, index) => (
                          <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                            <span>{index + 1}</span><span>{source.title}</span><b>↗</b>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </article>
            ))}
            {loading && (
              <article className="message-row assistant">
                <div className="avatar"><SparkleIcon small /></div>
                <div className="message-body">
                  <div className="message-author">모두의 AI</div>
                  <div className="thinking"><span /><span /><span /></div>
                </div>
              </article>
            )}
            <div ref={endRef} />
          </div>
        )}
      </section>

      <div className="composer-wrap">
        {error && <div className="error-message" role="alert">{error}</div>}
        <form className="composer" onSubmit={handleSubmit}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => { setInput(event.target.value); resizeTextarea(); }}
            onKeyDown={handleKeyDown}
            placeholder="무엇이든 물어보세요"
            rows={1}
            maxLength={4000}
            aria-label="메시지 입력"
          />
          <button type="submit" disabled={!input.trim() || loading} aria-label="메시지 보내기"><SendIcon /></button>
        </form>
        <p className="disclaimer"><span>Solar Pro 4</span>와 <span>Tavily MCP</span>로 답변해요 · AI는 실수할 수 있으니 중요한 정보는 확인해 주세요.</p>
      </div>
    </main>
  );
}
