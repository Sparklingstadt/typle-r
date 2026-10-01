import "./globals.css";
import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import Sidebar from "@/components/Sidebar/Sidebar";
import Navbar from "@/components/Navbar/Navbar";
import AuthProvider from "@/components/AuthProvider";
import { WorkspaceProvider } from "@/lib/useWordLists";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme/bootstrap";

const notoSans = Noto_Sans_JP({
  subsets: ["latin"],
  variable: "--font-noto-sans",
  display: "swap",
});

const title = "Typle | 自分の言葉で、タイピング。";
const description =
  "自分の単語リストで練習できるタイピングアプリ。好きな言葉を登録して、タイピングを練習し、ベスト記録を振り返れます。";
const siteUrl = process.env.AUTH_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");
const socialImage = {
  url: "/og-image.png",
  width: 1200,
  height: 630,
  type: "image/png",
  alt: "Typle — 自分の言葉で、タイピング。単語リストで練習・記録",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: "Typle",
    title,
    description,
    images: [socialImage],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [socialImage],
  },
};


export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" suppressHydrationWarning className={`${notoSans.variable} font-sans`}>
      <head>
        <script id="theme-bootstrap" dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="bg-muted/40 font-sans text-foreground antialiased">
      <AuthProvider>
      <WorkspaceProvider>
      <Navbar />
      <div className="flex min-h-[calc(100dvh-3.5rem)]">
        <Sidebar />
        <div id="main-content" tabIndex={-1} className="min-w-0 flex-1 outline-none">
          { children }
        </div>
      </div>
      </WorkspaceProvider>
      </AuthProvider>
      </body>
    </html>
  );
}
