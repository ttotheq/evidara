import type { Metadata } from "next";
import type { ReactNode } from "react";
import { THEME_BOOTSTRAP_SCRIPT } from "../lib/theme";
import "./styles.css";

export const metadata: Metadata = {
  title: "Evidara",
  description: "Open intelligence, source by source.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The theme bootstrap mutates <html data-theme> before hydration.
    <html lang="en" suppressHydrationWarning>
      <body>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static constant, no user input
          dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }}
        />
        {children}
      </body>
    </html>
  );
}
