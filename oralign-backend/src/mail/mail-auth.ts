/**
 * Sender authentication for outgoing mail — the part of deliverability the
 * HTML templates cannot fix.
 *
 * Gmail (and every large mailbox provider) only trusts a message when the
 * domain in its visible `From:` is proven by SPF or DKIM, and puts the rest
 * in spam or rejects it (Gmail sender guidelines, enforced since 2024 and
 * tightened from November 2025). SPF proves the relay's IP; DKIM proves the
 * message itself. When the SMTP relay does not sign for our domain (an ISP
 * mailbox, a Gmail "send as" alias), the app signs instead: nodemailer adds
 * a `DKIM-Signature: d=<domain>; s=<selector>` header, and the matching
 * public key is published at `<selector>._domainkey.<domain>`.
 *
 * Everything here is pure except checkDomainAuth(), which only READS public
 * DNS and logs — it never blocks or fails sending.
 */
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { promises as dns } from 'node:dns';

type Log = {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
};

export type DkimConfig = {
  domain?: string;
  selector?: string;
  privateKey?: string;
};

/** What nodemailer's transport-level `dkim` option takes. */
export type DkimSigning = {
  domainName: string;
  keySelector: string;
  privateKey: string;
};

/** Domain part of an address, lower-cased ('' when there is none). */
export function domainOf(address: string): string {
  return (address.split('@')[1] ?? '').trim().toLowerCase();
}

/**
 * DMARC relaxed alignment: the two domains share the same organisational
 * domain. Approximated as "equal, or one is a subdomain of the other",
 * which is exact for how this app uses it (oralign.com.tn and its
 * subdomains) without shipping a public-suffix list.
 */
export function aligned(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return !!x && !!y && (x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`));
}

/**
 * A PEM private key from an env value. Env files hold one line, so three
 * spellings are accepted: a real multi-line PEM, a PEM with literal `\n`
 * escapes, or the base64 of the whole PEM file (`base64 -w0 key.pem`).
 * Returns null when nothing usable is found.
 */
export function parseDkimPrivateKey(raw: string | undefined): string | null {
  if (!raw) return null;
  const unescaped = raw.replace(/\\n/g, '\n').trim();
  if (unescaped.includes('-----BEGIN')) return unescaped;
  const decoded = Buffer.from(raw.trim(), 'base64').toString('utf8').trim();
  return decoded.includes('-----BEGIN') ? decoded : null;
}

/** Base64 SPKI of the key's public half — what DNS publishes as `p=`. */
export function dkimPublicKeyBase64(privateKeyPem: string): string {
  return createPublicKey(createPrivateKey(privateKeyPem))
    .export({ type: 'spki', format: 'der' })
    .toString('base64');
}

/**
 * The DKIM signing options for the transport, or null when app-side
 * signing is off or unusable. Never throws: a broken key must not stop
 * mail (it would only lose the signature), so problems are logged loudly.
 */
export function resolveDkim(
  cfg: DkimConfig,
  fromDomain: string,
  log: Log,
): DkimSigning | null {
  const { selector, privateKey: raw } = cfg;
  if (!selector && !raw && !cfg.domain) return null;
  if (!selector || !raw) {
    log.error(
      'DKIM signing is half-configured: set BOTH MAIL_DKIM_SELECTOR and ' +
        'MAIL_DKIM_PRIVATE_KEY (MAIL_DKIM_DOMAIN defaults to the From ' +
        'domain). Mail is sent unsigned.',
    );
    return null;
  }
  const pem = parseDkimPrivateKey(raw);
  if (!pem) {
    log.error(
      'MAIL_DKIM_PRIVATE_KEY is not a PEM private key (accepted: PEM, PEM ' +
        'with \\n escapes, or base64 of the PEM file). Mail is sent unsigned.',
    );
    return null;
  }
  try {
    const key = createPrivateKey(pem);
    if (key.asymmetricKeyType !== 'rsa') {
      log.error(
        `MAIL_DKIM_PRIVATE_KEY is a ${key.asymmetricKeyType} key; DKIM needs ` +
          'an RSA key (openssl genrsa 2048). Mail is sent unsigned.',
      );
      return null;
    }
    const bits = key.asymmetricKeyDetails?.modulusLength ?? 0;
    if (bits < 1024) {
      log.error(
        `MAIL_DKIM_PRIVATE_KEY is ${bits}-bit; Gmail ignores DKIM keys ` +
          'under 1024 bits (2048 recommended). Mail is sent unsigned.',
      );
      return null;
    }
    if (bits < 2048) {
      log.warn(`DKIM key is ${bits}-bit; 2048 is recommended.`);
    }
  } catch (error) {
    log.error(
      `MAIL_DKIM_PRIVATE_KEY cannot be read (${(error as Error).message}). ` +
        'Mail is sent unsigned.',
    );
    return null;
  }

  const domainName = (cfg.domain || fromDomain).toLowerCase();
  if (!aligned(domainName, fromDomain)) {
    log.warn(
      `DKIM signs for "${domainName}" but mail is From "${fromDomain}": the ` +
        'signature is valid yet does NOT align, so it does not satisfy ' +
        "DMARC/Gmail for the From domain. Sign for the From domain's " +
        'organisational domain instead.',
    );
  }
  return { domainName, keySelector: selector, privateKey: pem };
}

/** All TXT strings at `name`, each record's chunks joined ([] when none). */
async function txt(name: string): Promise<string[]> {
  try {
    const records = await dns.resolveTxt(name);
    return records.map((chunks) => chunks.join(''));
  } catch {
    return [];
  }
}

/** `p=` value of a DKIM record, whitespace removed ('' when absent). */
function dkimRecordKey(record: string): string {
  const match = record.match(/(?:^|;)\s*p=([^;]*)/i);
  return match ? match[1].replace(/\s+/g, '') : '';
}

/**
 * Read the From domain's public DNS once at boot and say, in the logs,
 * whether Gmail will be able to authenticate what we send: SPF present,
 * DMARC present, and — when the app signs — the published DKIM key equals
 * ours (a mismatch makes every signature FAIL, worse than none).
 * Read-only, bounded by `timeoutMs`, never throws.
 */
export async function checkDomainAuth(
  fromDomain: string,
  dkim: DkimSigning | null,
  log: Log,
  timeoutMs = 8000,
): Promise<void> {
  if (!fromDomain) return;
  const run = async () => {
    const problems: string[] = [];

    const spf = (await txt(fromDomain)).filter((r) => /^v=spf1\b/i.test(r));
    if (spf.length === 0) {
      problems.push(
        `no SPF record on ${fromDomain}: add one TXT "v=spf1 include:<your ` +
          'SMTP provider> ~all"',
      );
    } else if (spf.length > 1) {
      problems.push(
        `${spf.length} SPF records on ${fromDomain}: SPF permerrors with more ` +
          'than one — merge them into a single TXT',
      );
    }

    const dmarc = (await txt(`_dmarc.${fromDomain}`)).filter((r) =>
      /^v=DMARC1\b/i.test(r),
    );
    if (dmarc.length === 0) {
      problems.push(
        `no DMARC record: add TXT _dmarc.${fromDomain} = "v=DMARC1; ` +
          `p=none; rua=mailto:<a mailbox you read>; fo=1"`,
      );
    }

    if (dkim) {
      const name = `${dkim.keySelector}._domainkey.${dkim.domainName}`;
      const published = (await txt(name)).map(dkimRecordKey).filter(Boolean);
      const ours = dkimPublicKeyBase64(dkim.privateKey);
      if (published.length === 0) {
        problems.push(
          `no DKIM key published at ${name}: every signature FAILS until ` +
            'TXT "v=DKIM1; k=rsa; p=<public key>" exists there',
        );
      } else if (!published.includes(ours)) {
        problems.push(
          `the DKIM key published at ${name} does not match ` +
            'MAIL_DKIM_PRIVATE_KEY: every signature FAILS',
        );
      }
    }

    if (problems.length === 0) {
      log.log(
        `Mail authentication DNS looks right for ${fromDomain} (SPF, DMARC` +
          `${dkim ? ', DKIM key matches' : ''}).`,
      );
    } else {
      log.warn(
        `Mail authentication DNS for ${fromDomain} — Gmail is likely to ` +
          `spam or reject our mail until fixed:\n  - ${problems.join('\n  - ')}`,
      );
    }
  };
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      log.warn(`Mail authentication DNS check timed out for ${fromDomain}.`);
      resolve();
    }, timeoutMs);
    timer.unref?.();
  });
  try {
    await Promise.race([run(), timeout]);
  } catch (error) {
    log.warn(
      `Mail authentication DNS check failed: ${(error as Error).message}`,
    );
  } finally {
    clearTimeout(timer);
  }
}
