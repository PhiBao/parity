import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SearchBar } from "@/components/SearchBar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Parity — the fair-price check for tokenised stocks",
    template: "%s · Parity",
  },
  description:
    "Parity compares every tokenised stock, ETF and commodity against its TradFi reference and against every rival wrapper — so you can see the premium before you pay it. Live data from the CoinMarketCap Pro API.",
  openGraph: {
    title: "Parity — the fair-price check for tokenised stocks",
    description:
      "Tokenised NVDA, AAPL, SPY and gold trade across dozens of issuers and venues. Parity shows which wrapper is cheapest, and when the whole market is rich or cheap versus the underlying.",
    type: "website",
  },
};

const NAV = [
  { href: "/", label: "Board" },
  { href: "/screener", label: "Screener" },
  { href: "/mcp", label: "MCP" },
  { href: "/methodology", label: "Methodology" },
  { href: "/endpoints", label: "Endpoints" },
  { href: "/feedback", label: "API feedback" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
          <div className="mx-auto flex h-14 w-full max-w-[1180px] items-center gap-4 px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2">
              <span className="relative flex h-5 w-5 items-center justify-center rounded-[5px] border border-accent/50 bg-accent/10">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              </span>
              <span className="text-[15px] font-semibold tracking-tight">Parity</span>
            </Link>

            <div className="ml-auto hidden md:block md:w-[300px]">
              <SearchBar compact />
            </div>

            <nav className="hidden items-center gap-1 lg:flex">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-2.5 py-1.5 text-sm text-muted transition hover:bg-white/[0.04] hover:text-fg"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="border-t border-line px-4 py-2 md:hidden">
            <SearchBar compact />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>

        <footer className="border-t border-line">
          <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-3 px-4 py-6 text-xs text-dim sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="space-y-1">
              <div className="text-muted">
                Parity measures wrapper premium and venue spread on tokenised real-world assets.
              </div>
              <div>
                Market data from the CoinMarketCap Pro API (Real-World Assets family). Reference
                prices from public exchange endpoints. Not investment advice.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/methodology" className="transition hover:text-fg">
                Methodology
              </Link>
              <Link href="/mcp" className="transition hover:text-fg">
                MCP
              </Link>
              <Link href="/endpoints" className="transition hover:text-fg">
                Endpoints used
              </Link>
              <Link href="/feedback" className="transition hover:text-fg">
                API feedback
              </Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
