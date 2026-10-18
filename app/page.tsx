import { redirect } from "next/navigation";
import Link from "next/link";
import { GoogleLogin } from "@/components/google-login";
import { createClient } from "@/lib/supabase/server";

export default async function Home({ searchParams }: { searchParams: Promise<{ code?: string; error?: string }> }) {
  const { code, error } = await searchParams;
  // Supabase falls back to the configured Site URL when a production callback
  // is not yet allow-listed. Keep that first production login recoverable.
  if (code) redirect(`/auth/callback?code=${encodeURIComponent(code)}`);
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (user) redirect("/chat");
  return <main className="landing">
    <header className="landing-nav">
      <Link href="/" className="logo"><span className="brand-mark">✦</span>모두의 AI<span className="logo-tag">KNOWLEDGE, CONNECTED</span></Link>
      <a href="#how-it-works" className="nav-about">서비스 알아보기 <span>↘</span></a>
    </header>
    <section className="landing-hero">
      <div className="hero-copy">
        <p className="hero-label"><span />문서 속 지식이, 나의 답이 되는 순간</p>
        <h1>쌓여 있는 문서에서<br /><em>필요한 답을</em> 찾다.</h1>
        <p className="hero-description">모두의 AI는 문서를 읽고, 질문의 맥락을 이해합니다.<br />복잡한 자료는 맡기고, 더 중요한 생각에 집중하세요.</p>
        <GoogleLogin />
        {error && <p role="alert" className="auth-error">로그인을 완료하지 못했어요. Google로 다시 시작해 주세요.</p>}
        <p className="login-note">Google 계정 하나로, 나만의 지식 공간을 시작하세요.</p>
        <div className="hero-proof"><span>문서에 기반한 답변</span><span>확인할 수 있는 출처</span><span>이어지는 대화</span></div>
      </div>
      <div className="hero-visual" aria-label="문서를 참고해 답변하는 서비스 화면 예시">
        <div className="visual-orbit" />
        <div className="floating-document"><span className="file-symbol">PDF</span><div>연구개발계획서<small>내 지식 라이브러리</small></div><span className="document-check">✓</span></div>
        <div className="preview-chat">
          <div className="preview-header"><span className="preview-dot" />모두의 AI<span>대화 예시</span></div>
          <div className="preview-question">이 연구의 핵심 목표가 뭐야?</div>
          <div className="preview-answer"><span className="preview-spark">✦</span><div><strong>복잡한 계획서도, 핵심부터.</strong><p>문서에서 질문과 관련된 내용을 찾아<br />이해하기 쉬운 답변으로 정리해 드려요.</p><div className="preview-citation">▤ 연구개발계획서 · 참고 문서</div></div></div>
          <div className="preview-input">궁금한 점을 이어서 물어보세요<span>↑</span></div>
        </div>
        <div className="floating-note"><span>✦</span>답변의 시작은, 신뢰할 수 있는 문서.</div>
      </div>
    </section>
    <section id="how-it-works" className="landing-features">
      <div className="feature-intro"><p className="eyebrow">LESS SEARCHING. MORE UNDERSTANDING.</p><h2>정보를 찾는 시간은 줄이고,<br />이해하는 깊이는 더하고.</h2></div>
      <article><span className="feature-number">01 / FIND</span><h3>질문의 의미로 찾습니다</h3><p>단어가 정확히 같지 않아도, 질문과 관련된 문서의 내용을 찾아 답변합니다.</p></article>
      <article><span className="feature-number">02 / TRUST</span><h3>출처까지 함께 답합니다</h3><p>참고한 문서 이름과 페이지를 확인하고, 답변의 근거를 직접 살펴보세요.</p></article>
      <article><span className="feature-number">03 / CONTINUE</span><h3>대화는 계속 이어집니다</h3><p>주제별 채팅방과 대화 기록이 저장되어, 언제든 지난 질문에서 이어갈 수 있어요.</p></article>
    </section>
    <footer className="landing-footer"><span>모두의 AI</span><p>더 가까운 지식, 더 넓어지는 가능성.</p><span>© {new Date().getFullYear()} 모두의 AI</span></footer>
  </main>;
}
