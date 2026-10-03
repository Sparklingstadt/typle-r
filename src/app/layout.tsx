import "./globals.css";
import type { Metadata } from "next";
import { Noto_Sans_JP, Noto_Sans_SC, Noto_Sans_TC } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import Sidebar from "@/components/Sidebar/Sidebar";
import Navbar from "@/components/Navbar/Navbar";
import AuthProvider from "@/components/AuthProvider";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme/bootstrap";
import { openGraphLocales, type Locale } from "@/i18n/config";

const notoSans = Noto_Sans_JP({
  subsets: ["latin"],
  variable: "--font-noto-sans",
  display: "swap",
});
// Chinese needs its own glyph shapes; these load only when that language is chosen.
const notoSansSC = Noto_Sans_SC({ preload: false, variable: "--font-noto-sans", display: "swap" });
const notoSansTC = Noto_Sans_TC({ preload: false, variable: "--font-noto-sans", display: "swap" });
const fonts: Partial<Record<Locale, string>> = { "zh-CN": notoSansSC.variable, "zh-TW": notoSansTC.variable };

const siteUrl = process.env.AUTH_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations("metadata");
  const title = t("title");
  const description = t("description");
  const socialImage = {
    url: "/og-image.png",
    width: 1200,
    height: 630,
    type: "image/png",
    alt: t("imageAlt"),
  };
  return {
    metadataBase: new URL(siteUrl),
    title,
    description,
    openGraph: {
      type: "website",
      locale: openGraphLocales[locale],
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
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    // The class on <html> must not change with the language: the theme script adds `dark` there.
    <html lang={locale} suppressHydrationWarning className={`${notoSans.variable} font-sans`}>
      <head>
        <script id="theme-bootstrap" dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className={`${fonts[locale] ?? ""} bg-muted/40 font-sans text-foreground antialiased`}>
      <NextIntlClientProvider>
      <AuthProvider>
      <Navbar />
      <div className="flex min-h-[calc(100dvh-3.5rem)]">
        <Sidebar />
        <div id="main-content" tabIndex={-1} className="min-w-0 flex-1 outline-none">
          { children }
        </div>
      </div>
      </AuthProvider>
      </NextIntlClientProvider>
      </body>
    </html>
  );
}
