import type { Metadata } from "next";
import { Public_Sans } from "next/font/google";
import "./globals.css";

const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Numa — Understand your health data, not just see it",
  description:
    "Numa synthesizes wearable data, reflections, and training history into context you can trust.",
};

/**
 * Runs synchronously before React hydrates, so the page paints with the
 * correct theme on first render and we never see the light-mode flash
 * on reload. Reads the user's saved preference (system / light / dark)
 * and toggles .dark on <html>. Mirrors the logic in useTheme.ts.
 */
const themeBootScript = `
(function() {
  try {
    var stored = localStorage.getItem('numa-theme');
    var pref = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    var dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={publicSans.variable} suppressHydrationWarning>
      <head>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <link
        rel="icon"
        type="image/png"
        href="/favicon-96x96.png"
        sizes="96x96"
      />
      <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      <link rel="shortcut icon" href="/favicon.ico" />
      <link
        rel="apple-touch-icon"
        sizes="180x180"
        href="/apple-touch-icon.png"
      />
      <link rel="manifest" href="/site.webmanifest" />
      <body className="font-sans antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-control focus:bg-accent-emerald focus:px-4 focus:py-2 focus:text-text-inverse"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
