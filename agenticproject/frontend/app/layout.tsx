import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Plus_Jakarta_Sans } from "next/font/google";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ResumeWorthy - Job Applications",
  description: "Find jobs, tailor your resume, and connect with recruiters",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={jakarta.variable}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="bg-gray-50 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
