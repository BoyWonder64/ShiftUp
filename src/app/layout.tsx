import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
  Orbitron,
  Poppins,
  Montserrat,
  Playfair_Display,
  Merriweather,
  Oswald,
  Raleway,
  Pacifico,
  Dancing_Script,
} from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { Footer } from "@/components/Footer";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Racing-dashboard display face, scoped to just the nav brand wordmark
// (AppHeader's "ShiftUp") via the `font-display` utility - body text and
// every heading stay on the existing Helvetica/Arial stack for readability.
const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  weight: ["500", "700", "900"],
});

// Admin-selectable fonts for a tenant's own business name (Settings > Company
// Profile - see src/lib/fonts/companyNameFonts.ts, which owns the key/cssVar
// mapping these must match). Loaded globally, same as the fonts above, since
// next/font/google loaders must be module-level calls - which tenant (if any)
// actually uses a given one is decided per-request in AppHeader/dashboard.
const companyPoppins = Poppins({ variable: "--font-company-poppins", subsets: ["latin"], weight: ["500", "700"] });
const companyMontserrat = Montserrat({ variable: "--font-company-montserrat", subsets: ["latin"], weight: ["500", "700"] });
const companyPlayfairDisplay = Playfair_Display({
  variable: "--font-company-playfair-display",
  subsets: ["latin"],
  weight: ["600", "700"],
});
const companyMerriweather = Merriweather({
  variable: "--font-company-merriweather",
  subsets: ["latin"],
  weight: ["400", "700"],
});
const companyOswald = Oswald({ variable: "--font-company-oswald", subsets: ["latin"], weight: ["500", "700"] });
const companyRaleway = Raleway({ variable: "--font-company-raleway", subsets: ["latin"], weight: ["500", "700"] });
const companyPacifico = Pacifico({ variable: "--font-company-pacifico", subsets: ["latin"], weight: "400" });
const companyDancingScript = Dancing_Script({
  variable: "--font-company-dancing-script",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const companyNameFontVariables = [
  companyPoppins,
  companyMontserrat,
  companyPlayfairDisplay,
  companyMerriweather,
  companyOswald,
  companyRaleway,
  companyPacifico,
  companyDancingScript,
]
  .map((f) => f.variable)
  .join(" ");

export const metadata: Metadata = {
  title: "ShiftUp",
  description: "Scheduling for service businesses.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} ${orbitron.variable} ${companyNameFontVariables} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <NextIntlClientProvider>
          {children}
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
