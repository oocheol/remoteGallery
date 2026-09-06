"use client";
import { useState } from "react";
import { AppBrand } from "@/components/AppBrand";
export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="shell" style={{ maxWidth: 440, paddingTop: "15vh" }}>
      <AppBrand />
      <section className="card" style={{ padding: 28, marginTop: 24 }}>
        <h1 className="display" style={{ fontSize: 32 }}>
          내 전시 공간 열기
        </h1>
        <p className="muted">
          작품과 배치를 편집하려면 관리자 비밀번호를 입력하세요.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const response = await fetch("/api/session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password }),
              });
              const data = await response.json();
              if (!response.ok) throw new Error(data.error);
              const next = new URLSearchParams(location.search).get("next");
              location.assign(
                next?.startsWith("/") &&
                  !next.startsWith("//") &&
                  !next.includes("\\")
                  ? next
                  : "/",
              );
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "로그인하지 못했습니다.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            관리자 비밀번호
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="notice">
              {error}
            </p>
          )}
          <button
            className="btn primary"
            disabled={busy}
            style={{ width: "100%", marginTop: 16 }}
          >
            {busy ? "확인 중…" : "로그인"}
          </button>
        </form>
      </section>
    </main>
  );
}
