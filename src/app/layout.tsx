import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Transcrajb",
  description: "Live transkribering av möten med automatiska mötesanteckningar"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>): JSX.Element {
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  );
}
