import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jam — Listen together",
  description: "Create a room and listen to music in sync with your friends.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
