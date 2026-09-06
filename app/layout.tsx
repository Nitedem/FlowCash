import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlowCash",
  description: "Plateforme de paiement et de gestion financière.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
