import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AddToHomeScreenHint from "@/components/AddToHomeScreenHint";
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
  title: "Vitality",
  description: "Your daily coaching dashboard — macros, weight progress, habits, and Vitto.",
  icons: {
    icon: "/icon-48.png",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Vitality",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b5f5e",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <AddToHomeScreenHint />
      </body>
    </html>
  );
}
