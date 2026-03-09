import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "600", "800"],
});

export const metadata: Metadata = {
  title: "Commune Agent — Century 21",
  description: "Analysez une commune française avec l'IA et les données data.gouv.fr",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* Prevent flash: apply dark class before React hydrates */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){if(localStorage.getItem('theme')!=='light'){document.documentElement.classList.add('dark')}})()`,
          }}
        />
      </head>
      <body className={`${plusJakarta.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}
