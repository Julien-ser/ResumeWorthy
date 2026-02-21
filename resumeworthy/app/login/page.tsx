"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let active = true;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (active && data.user) {
        router.replace("/");
      }
    })();

    return () => {
      active = false;
    };
  }, [router]);

  async function sendMagicLink() {
    if (!email.trim()) {
      alert("Enter your email first.");
      return;
    }

    try {
      setSending(true);
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/` : undefined,
        },
      });

      if (error) throw error;
      alert("Magic link sent. Check your email to sign in.");
    } catch (error: any) {
      alert(error?.message || "Failed to send magic link.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-white text-[rgba(57,26,27,1)] flex items-center justify-center px-6">
      <div className="w-full max-w-md border border-[rgba(212,100,101,0.25)] rounded-2xl p-6 bg-[rgba(212,100,101,0.06)]">
        <h1 className="text-3xl font-semibold">Log in</h1>
        <p className="mt-2 text-sm text-[rgba(110,54,55,1)]">
          Enter your email and we’ll send you a secure sign-in link.
        </p>

        <div className="mt-5 space-y-3">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-md border border-[rgba(212,100,101,0.3)] px-3 py-2 text-sm outline-none"
          />

          <button
            onClick={sendMagicLink}
            disabled={sending}
            className="w-full rounded-md bg-[rgba(212,100,101,1)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {sending ? "Sending..." : "Send magic link"}
          </button>

          <button
            onClick={() => router.push("/")}
            className="w-full rounded-md border border-[rgba(212,100,101,0.35)] px-4 py-2 text-sm font-medium text-[rgba(212,100,101,1)] bg-white"
          >
            Back to app
          </button>
        </div>
      </div>
    </main>
  );
}
