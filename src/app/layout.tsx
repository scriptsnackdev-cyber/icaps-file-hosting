import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NextTopLoader from 'nextjs-toploader';

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
import { ActionProvider } from "@/contexts/ActionContext";

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
        <NextTopLoader color="#3B82F6" showSpinner={false} height={3} shadow="0 0 10px #3B82F6,0 0 5px #3B82F6" />
        <ToastProvider>
          <AuthProvider>
            <StorageProvider>
              <ActionProvider>
                {children}
              </ActionProvider>
            </StorageProvider>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
