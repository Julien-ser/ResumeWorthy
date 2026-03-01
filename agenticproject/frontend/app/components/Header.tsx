import Image from "next/image";
import logo from "../logo.png";

export default function Header() {
  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="container mx-auto px-4 py-6 max-w-7xl flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* RW Logo */}
          <div className="flex-shrink-0">
            <Image src={logo} alt="ResumeWorthy Logo" width={56} height={56} className="w-14 h-14" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">ResumeWorthy</h1>
            <p className="text-xs text-primary-600 font-semibold">Is it resume worthy?</p>
          </div>
        </div>
        <div className="text-right text-sm">
          <p className="text-xs text-gray-600">Powered by OpenRouter AI</p>
        </div>
      </div>
    </header>
  );
}
