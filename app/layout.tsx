import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Footer } from "@/components/footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Codezela Career Accelerator - LMS",
    template: "%s | Codezela Career Accelerator",
  },
  description:
    "Codezela Career Accelerator Learning Management System for programming courses, career development, and hands-on learning experiences.",
  keywords: [
    "Codezela",
    "Career Accelerator",
    "LMS",
    "Learning Management System",
    "Programming Courses",
    "Tech Education",
    "Career Development",
  ],
  authors: [{ name: "Codezela" }],
  creator: "Codezela",
  publisher: "Codezela",
  applicationName: "Codezela Career Accelerator LMS",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
  openGraph: {
    type: "website",
    siteName: "Codezela Career Accelerator",
    title: "Codezela Career Accelerator - LMS",
    description:
      "Codezela Career Accelerator Learning Management System for programming courses and career development.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f0f4f0" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0f0a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col scanline`}
      >
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="beforeInteractive"
        />
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-S1F397DHHS"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-S1F397DHHS');
          `}
        </Script>
        <ThemeProvider>
          {children}
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
