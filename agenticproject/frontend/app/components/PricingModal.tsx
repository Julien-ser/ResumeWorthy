"use client";

import { useState } from "react";
import { useAuth, SignInButton } from "@clerk/nextjs";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface PricingModalProps {
  open: boolean;
  onClose: () => void;
}

export default function PricingModal({ open, onClose }: PricingModalProps) {
  const { isSignedIn, getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const handleUpgrade = async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/create-checkout-session`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.detail || "Failed to start checkout");
      }
      const { checkout_url } = await res.json();
      window.location.href = checkout_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8 z-10">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl font-bold leading-none"
        >
          ×
        </button>

        <div className="text-center mb-8">
          <p className="text-xs font-bold text-primary-600 uppercase tracking-widest mb-2">Simple Pricing</p>
          <h2 className="text-2xl font-extrabold text-gray-900">Unlock unlimited resume tailoring</h2>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8">
          {/* Free tier */}
          <div className="rounded-2xl border border-gray-100 p-5 bg-gray-50">
            <p className="text-sm font-bold text-gray-500 mb-1">Free</p>
            <p className="text-3xl font-extrabold text-gray-900 mb-4">$0</p>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-center gap-2"><CheckIcon dim /> 3 resume tailors / month</li>
              <li className="flex items-center gap-2"><CheckIcon dim /> Unlimited job search</li>
              <li className="flex items-center gap-2"><CheckIcon dim /> Unlimited recruiter finder</li>
              <li className="flex items-center gap-2"><CheckIcon dim /> PDF export</li>
            </ul>
          </div>

          {/* Pro tier */}
          <div className="rounded-2xl border-2 border-primary-400 p-5 bg-gradient-to-b from-primary-50 to-white relative overflow-hidden">
            <div className="absolute top-3 right-3 bg-primary-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              PRO
            </div>
            <p className="text-sm font-bold text-primary-600 mb-1">Pro</p>
            <div className="flex items-baseline gap-1 mb-4">
              <p className="text-3xl font-extrabold text-gray-900">$12</p>
              <p className="text-sm text-gray-400">/mo</p>
            </div>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-center gap-2"><CheckIcon /> Unlimited resume tailors</li>
              <li className="flex items-center gap-2"><CheckIcon /> Unlimited job search</li>
              <li className="flex items-center gap-2"><CheckIcon /> Unlimited recruiter finder</li>
              <li className="flex items-center gap-2"><CheckIcon /> PDF export</li>
              <li className="flex items-center gap-2"><CheckIcon /> Priority support</li>
            </ul>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2 mb-4 text-center">
            {error}
          </p>
        )}

        {isSignedIn ? (
          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="w-full bg-gradient-to-r from-primary-600 to-primary-500 text-white font-bold py-3.5 rounded-xl hover:from-primary-700 hover:to-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm text-base"
          >
            {loading ? "Redirecting to checkout…" : "Subscribe — $12 / month"}
          </button>
        ) : (
          <SignInButton mode="modal">
            <button className="w-full bg-gradient-to-r from-primary-600 to-primary-500 text-white font-bold py-3.5 rounded-xl hover:from-primary-700 hover:to-primary-600 transition-all shadow-sm text-base">
              Sign In to Upgrade
            </button>
          </SignInButton>
        )}

        <p className="text-xs text-center text-gray-400 mt-3">
          Cancel anytime. No hidden fees.
        </p>
      </div>
    </div>
  );
}

function CheckIcon({ dim }: { dim?: boolean }) {
  return (
    <svg
      className={`w-4 h-4 flex-shrink-0 ${dim ? "text-gray-400" : "text-primary-500"}`}
      fill="currentColor"
      viewBox="0 0 20 20"
    >
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}
