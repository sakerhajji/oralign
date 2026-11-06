import type { LegalCompany } from "@/lib/legal/legal-content";

/**
 * The ORALIGN® contact card of the printed QR codes (/qr): how its phone
 * number reads and dials, and the contact file a phone can save. Pure and
 * framework-free, so the card (client) and the .vcf route (server) share
 * one formatting.
 *
 * The values themselves come from the company settings
 * (CompanyBillingSettings, read by getLegalCompany): an admin edit at
 * /account/billing-settings reaches every printed code.
 */

/** Separators people type between digits: spaces, dots, dashes, brackets. */
const SEPARATORS = /[\s.\-()  ]/g;

/**
 * The settings' phone is free text: when it holds two numbers
 * ("71 000 000 / 29 807 809"), the card shows and dials the first one
 * rather than gluing every digit into one wrong number.
 */
function firstNumber(raw: string): string {
  return raw.split(/[/,;|]|\s(?:ou|or|et|and)\s/i)[0].trim();
}

/**
 * A Tunisian number as people read it: "+21629807809", "0021629807809",
 * "216 29807809" and "29807809" all show as "+216 29 807 809". Any other
 * number is shown as stored (trimmed): it is the admin's own spelling.
 */
export function displayPhone(raw: string): string {
  const compact = firstNumber(raw).replace(SEPARATORS, "");
  const match = /^(?:(?:\+|00)?216)?(\d{2})(\d{3})(\d{3})$/.exec(compact);
  return match ? `+216 ${match[1]} ${match[2]} ${match[3]}` : raw.trim();
}

/**
 * The number as a phone dials it, for tel: links and the contact file:
 * digits and a leading "+" only, "00" read as "+", and a Tunisian number
 * typed without its "+" (or with no country code at all) given one —
 * the card is scanned from Tunisian kits, but also abroad.
 */
export function dialablePhone(raw: string): string {
  const compact = firstNumber(raw).replace(/[^\d+]/g, "");
  if (/^\d{8}$/.test(compact)) return `+216${compact}`;
  if (/^216\d{8}$/.test(compact)) return `+${compact}`;
  if (compact.startsWith("00")) return `+${compact.slice(2)}`;
  return compact;
}

/**
 * The company line under the wordmark, "by Aura Aligners": it names the
 * e-mail's domain. The settings' company name is free text and may
 * already carry the brand ("ORALIGN by Aura Aligners"), which is not
 * repeated; the brand alone adds nothing and gives no line.
 */
export function companyByline(name: string | null | undefined): string | null {
  const rest = (name ?? "")
    .trim()
    .replace(/^ORALIGN®?\s*(?:[-–—·|]\s*)?(?:by\s+)?/i, "")
    .trim();
  return rest ? `by ${rest}` : null;
}

/** vCard text values escape backslash, comma, semicolon and line breaks. */
function vcardText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/**
 * The card as a vCard 3.0 (the version iOS and Android both import):
 * a company card named after the brand, with the phone, the e-mail and
 * the site. CRLF line ends, as the format requires. Fields the settings
 * leave empty are left out rather than written blank.
 */
export function buildContactVCard(
  company: Pick<LegalCompany, "tradeName" | "phone" | "email">,
  siteUrl: string,
): string {
  const name = vcardText(company.tradeName?.trim() || "ORALIGN");
  const phone = company.phone?.trim() ? dialablePhone(company.phone) : "";
  const email = company.email?.trim() ?? "";
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${name};;;;`,
    `FN:${name}`,
    `ORG:${name}`,
    // Apple Contacts shows the card as a company, under its ORG.
    "X-ABShowAs:COMPANY",
    phone ? `TEL;TYPE=WORK,VOICE:${phone}` : "",
    email ? `EMAIL;TYPE=INTERNET,WORK:${vcardText(email)}` : "",
    `URL:${siteUrl}`,
    "END:VCARD",
  ];
  return `${lines.filter(Boolean).join("\r\n")}\r\n`;
}
