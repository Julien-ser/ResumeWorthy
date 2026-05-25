"use client";

import Image from "next/image";
import {
  SignInButton,
  SignedIn,
  SignedOut,
  UserButton,
  useUser,
} from "@clerk/nextjs";

interface HeaderProps {
  onUpgrade?: () => void;
}

export default function Header({ onUpgrade }: HeaderProps) {
  const { user } = useUser();

  return (
    <header className="bg-white border-b border-stone-100 sticky top-0 z-10">
      <div className="container mx-auto px-6 py-3.5 max-w-4xl flex items-center justify-between">

        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 rounded-xl overflow-hidden">
            <Image
              src="/logo.png"
              alt="ResumeWorthy Logo"
              width={36}
              height={36}
              className="w-9 h-9"
            />
          </div>
          <div>
            <h1 className="text-base font-bold text-stone-900">ResumeWorthy</h1>
            <p className="text-[10px] text-primary-500 font-semibold tracking-widest uppercase leading-none mt-0.5">
              Is it resume worthy?
            </p>
          </div>
        </div>

        {/* Auth */}
        <div className="flex items-center gap-3">
          <SignedOut>
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-stone-400 mr-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
              Powered by AI
            </div>
            <SignInButton mode="modal">
              <button className="text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors">
                Sign in
              </button>
            </SignInButton>
          </SignedOut>

          <SignedIn>
            <button
              onClick={onUpgrade}
              className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-stone-900 hover:bg-stone-700 active:scale-[0.97] rounded-xl transition-all duration-150"
            >
              Upgrade to Pro
            </button>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
        </div>
      </div>
    </header>
  );
}
