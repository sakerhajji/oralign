import { buildContactVCard } from "../../../(showcase)/_lib/contact-card";
import { getLegalCompany } from "../../../(showcase)/_lib/legal-info";
import { SITE_URL } from "../../../(showcase)/_lib/seo/meta";

/**
 * /qr/contact.vcf — the "Enregistrer le contact" file of the QR card: the
 * company settings' phone and e-mail as a vCard. Served inline: iOS opens
 * it straight in Contacts, Android downloads it and offers Contacts. The
 * settings fetch keeps its 5-minute cache; so does the browser.
 */
export async function GET() {
  const company = await getLegalCompany();
  if (!company.phone?.trim() && !company.email?.trim()) {
    // The settings could not be read: no empty contact. Back to the
    // contact sheet (#contact reopens it), which says so in the visitor's
    // language instead of a bare English error. A relative Location: behind
    // nginx the request URL may carry the container's own host, the browser
    // resolves this one against its own.
    return new Response(null, {
      status: 307,
      headers: { Location: "/qr#contact", "Cache-Control": "no-store" },
    });
  }
  return new Response(buildContactVCard(company, SITE_URL), {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": 'inline; filename="ORALIGN.vcf"',
      "Cache-Control": "public, max-age=300",
      "X-Robots-Tag": "noindex",
    },
  });
}
