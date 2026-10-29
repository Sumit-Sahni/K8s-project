import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "DevOps Control Room",
  description: "A Next.js app that shows Kubernetes, CI/CD and GitOps in action",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
