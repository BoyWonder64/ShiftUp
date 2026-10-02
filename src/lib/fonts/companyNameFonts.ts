// Font choices for a tenant's business name (AppHeader, dashboard heading).
// Each entry's `cssVar` must match the `variable` passed to the matching
// next/font/google loader in src/app/layout.tsx - that's what actually loads
// the font and makes the CSS variable resolve to something.
export const COMPANY_NAME_FONTS = [
  { key: "poppins", label: "Poppins", cssVar: "--font-company-poppins" },
  { key: "montserrat", label: "Montserrat", cssVar: "--font-company-montserrat" },
  { key: "playfair_display", label: "Playfair Display", cssVar: "--font-company-playfair-display" },
  { key: "merriweather", label: "Merriweather", cssVar: "--font-company-merriweather" },
  { key: "oswald", label: "Oswald", cssVar: "--font-company-oswald" },
  { key: "raleway", label: "Raleway", cssVar: "--font-company-raleway" },
  { key: "pacifico", label: "Pacifico", cssVar: "--font-company-pacifico" },
  { key: "dancing_script", label: "Dancing Script", cssVar: "--font-company-dancing-script" },
] as const;

export type CompanyNameFontKey = (typeof COMPANY_NAME_FONTS)[number]["key"];

export const COMPANY_NAME_FONT_KEYS = COMPANY_NAME_FONTS.map((f) => f.key) as CompanyNameFontKey[];

/** CSS `font-family` value for a stored font key, or undefined for the default body font. */
export function companyNameFontFamily(key: string | null | undefined): string | undefined {
  const font = COMPANY_NAME_FONTS.find((f) => f.key === key);
  return font ? `var(${font.cssVar})` : undefined;
}
