import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="bg-gray-50">
        {children}
      </body>
    </html>
  );
}
