import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ConditionalLayout } from "@/components/ConditionalLayout";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Spend | AI Transaction Tracker",
  description: "Track your credit card transactions with AI. Just record your screen and we'll extract every transaction automatically.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Spend | AI Transaction Tracker",
    description: "Track your credit card transactions with AI. Just record your screen and we'll extract every transaction automatically.",
    url: "https://spend.mykclawd.xyz",
    siteName: "Spend",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Spend - AI Transaction Tracker",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Spend | AI Transaction Tracker",
    description: "Track your credit card transactions with AI. Just record your screen.",
    images: ["/og-image.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body
          className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-zinc-50 dark:bg-zinc-950 antialiased`}
        >
          <ConditionalLayout>{children}</ConditionalLayout>
        </body>
      </html>
    </ClerkProvider>
  );
}
