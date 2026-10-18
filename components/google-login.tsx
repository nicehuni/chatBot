"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function GoogleLogin() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function login() {
    setBusy(true);
    setError("");
    try {
      const { error } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch {
      setError("로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.");
      setBusy(false);
    }
  }
  return <div className="login-action">
    <button className="google-button" onClick={login} disabled={busy}>
      <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5h6.6c3.9-3.6 6.1-8.9 6.1-14.9Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5c-1.8 1.2-4.1 1.9-6.9 1.9-5.3 0-9.8-3.6-11.4-8.4H5.8v5.2A20.4 20.4 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.6 27.6a12.2 12.2 0 0 1 0-7.2v-5.2H5.8a20 20 0 0 0 0 17.6l6.8-5.2Z"/><path fill="#EA4335" d="M24 12c3 0 5.7 1 7.8 3l5.8-5.8A19.6 19.6 0 0 0 24 4 20.4 20.4 0 0 0 5.8 15.2l6.8 5.2C14.2 15.6 18.7 12 24 12Z"/></svg>
      {busy ? "Google로 연결 중…" : "Google로 시작하기"}<span aria-hidden="true">↗</span>
    </button>
    {error && <p role="alert" className="auth-error">{error}</p>}
  </div>;
}
