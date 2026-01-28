import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "ICAPS CLOUD",
  description: "Secure file hosting for ICAPS",
};

import { ToastProvider } from "@/contexts/ToastContext";
import { StorageProvider } from "@/contexts/StorageContext";
import { AuthProvider } from "@/contexts/AuthContext";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ToastProvider>
          <StorageProvider>
            <AuthProvider>
              {children}
            </AuthProvider>
          </StorageProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
