import Image from "next/image";

export default function Header() {
  return (
    <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10">
      <div className="container mx-auto px-6 py-4 max-w-7xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 rounded-xl overflow-hidden shadow-sm">
            <Image src="/logo.png" alt="ResumeWorthy Logo" width={44} height={44} className="w-11 h-11" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">ResumeWorthy</h1>
            <p className="text-xs text-primary-600 font-semibold tracking-wide uppercase">Is it resume worthy?</p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400 font-medium">
          <span className="w-2 h-2 rounded-full bg-green-400 inline-block animate-pulse"></span>
          Powered by OpenRouter AI
        </div>
      </div>
    </header>
  );
}
