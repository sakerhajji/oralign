# DNS records for oralign.com.tn

The zone is hosted at TopNet (`ns1`, `ns2`, `ns3.topnetpro.com`) and edited in
the TopNet customer panel, not from this repository. This file is the record
of what the zone must contain so that nobody deletes a record that looks
unused. Keep it in step with the panel.

## Hosts (all on the VPS)

| Record | Name     | Value             |
|--------|----------|-------------------|
| A      | `@`      | `187.124.190.149` |
| A      | `www`    | `187.124.190.149` |
| A      | `api`    | `187.124.190.149` |
| A      | `viewer` | `187.124.190.149` |

`www` is only a 301 to the apex (see `deploy/nginx/oralign.com.tn.conf`).

## Mail

| Record | Name | Value                                     |
|--------|------|-------------------------------------------|
| TXT    | `@`  | `v=spf1 include:_spf.topnetpro.com ~all`  |

DKIM and DMARC are still missing; see the mail-deliverability notes.

## Google Search Console — domain property verification

Google verifies the `oralign.com.tn` *domain property* (every subdomain and
both protocols in one Search Console property) through a CNAME record. The
record must stay in the zone for as long as the property exists: Google
re-checks it and drops the verification when the record disappears.

| Record | Name (host)    | Value (points to)                        |
|--------|----------------|------------------------------------------|
| CNAME  | `kxzpr4zxv2bt` | `gv-lakmlfavna2gsq.dv.googlehosted.com.` |

Added 2026-11-04. Some panels want the full host, `kxzpr4zxv2bt.oralign.com.tn`;
the trailing dot on the value is optional in most panels.

The older *URL-prefix* property `https://oralign.com.tn/` is verified by the
HTML file `oralign-frontend/public/google0a527ce784cca1f2.html` and, when
`NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` is set, by the meta tag in
`oralign-frontend/src/app/layout.tsx`. Keep both: the domain property is the
one to use for reports, the URL-prefix one still holds the history.

Check from any machine once the panel has saved (TopNet propagates within
minutes, Google may take up to a day to notice):

```bash
nslookup -type=CNAME kxzpr4zxv2bt.oralign.com.tn 8.8.8.8
```
