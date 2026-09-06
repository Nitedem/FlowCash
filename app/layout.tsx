import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "FlowCash",
  description: "Plateforme de paiement et de gestion financière.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
