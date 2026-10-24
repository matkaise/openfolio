import type { Metadata } from "next";
import { Geist_Mono, Manrope } from "next/font/google";
import "./globals.css";
import { ProjectProvider } from '@/contexts/ProjectContext';
import { BrokerSyncProvider } from '@/components/brokers/BrokerSyncContext';
import { THEME_BOOT_SCRIPT } from '@/lib/theme';

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Openfolio",
  description: "Lokaler Portfolio-Tracker",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        {/* Applies the last chosen theme before the first paint */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body
        className={`${manrope.variable} ${geistMono.variable} antialiased`}
      >
        <ProjectProvider>
          <BrokerSyncProvider>
            {children}
          </BrokerSyncProvider>
        </ProjectProvider>
      </body>
    </html>
  );
}
