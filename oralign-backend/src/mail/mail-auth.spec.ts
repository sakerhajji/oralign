import { generateKeyPairSync } from 'node:crypto';
import { promises as dns } from 'node:dns';
import {
  aligned,
  checkDomainAuth,
  dkimPublicKeyBase64,
  domainOf,
  parseDkimPrivateKey,
  resolveDkim,
} from './mail-auth';

/**
 * Sender authentication is what decides Gmail's inbox vs spam for a
 * transactional sender, so its failure modes must be LOUD and never stop
 * mail: a bad key is logged and mail goes out unsigned; the boot DNS check
 * reports what Gmail will see (missing DMARC, a published DKIM key that
 * does not match ours) without blocking anything.
 */

function rsaPem(bits: number): { pem: string; spki: string } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: bits,
  });
  return {
    pem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    spki: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  };
}

const key2048 = rsaPem(2048);

function logger() {
  return {
    log: jest.fn<void, [string]>(),
    warn: jest.fn<void, [string]>(),
    error: jest.fn<void, [string]>(),
  };
}

describe('domainOf / aligned', () => {
  it('extracts the lower-cased domain of an address', () => {
    expect(domainOf('No-Reply@Oralign.COM.tn')).toBe('oralign.com.tn');
    expect(domainOf('not-an-address')).toBe('');
  });

  it.each([
    ['oralign.com.tn', 'oralign.com.tn', true],
    ['mail.oralign.com.tn', 'oralign.com.tn', true],
    ['oralign.com.tn', 'mail.oralign.com.tn', true],
    ['aura-aligners.com', 'oralign.com.tn', false],
    ['gmail.com', 'oralign.com.tn', false],
    // A suffix that is not a label boundary is a different domain.
    ['evil-oralign.com.tn', 'oralign.com.tn', false],
    ['', 'oralign.com.tn', false],
  ])('aligned(%s, %s) = %s', (a, b, expected) => {
    expect(aligned(a, b)).toBe(expected);
  });
});

describe('parseDkimPrivateKey', () => {
  it('accepts a PEM as-is', () => {
    expect(parseDkimPrivateKey(key2048.pem)).toBe(key2048.pem.trim());
  });

  it('accepts a one-line PEM with literal \\n escapes', () => {
    const oneLine = key2048.pem.trim().replace(/\n/g, '\\n');
    expect(parseDkimPrivateKey(oneLine)).toBe(key2048.pem.trim());
  });

  it('accepts the base64 of the PEM file (base64 -w0 key.pem)', () => {
    const b64 = Buffer.from(key2048.pem).toString('base64');
    expect(parseDkimPrivateKey(b64)).toBe(key2048.pem.trim());
  });

  it.each([
    undefined,
    '',
    'not a key',
    Buffer.from('hello').toString('base64'),
  ])('returns null for %p', (raw) => {
    expect(parseDkimPrivateKey(raw)).toBeNull();
  });
});

describe('resolveDkim', () => {
  it('is off, silently, when nothing is configured', () => {
    const log = logger();
    expect(resolveDkim({}, 'oralign.com.tn', log)).toBeNull();
    expect(log.error).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('signs for the From domain by default', () => {
    const log = logger();
    expect(
      resolveDkim(
        { selector: 'oralign1', privateKey: key2048.pem },
        'oralign.com.tn',
        log,
      ),
    ).toEqual({
      domainName: 'oralign.com.tn',
      keySelector: 'oralign1',
      privateKey: key2048.pem.trim(),
    });
    expect(log.error).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('refuses a half configuration loudly and sends unsigned', () => {
    const log = logger();
    expect(
      resolveDkim({ selector: 'oralign1' }, 'oralign.com.tn', log),
    ).toBeNull();
    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining('half-configured'),
    );
  });

  it('refuses something that is not a key', () => {
    const log = logger();
    expect(
      resolveDkim({ selector: 's', privateKey: 'nope' }, 'oralign.com.tn', log),
    ).toBeNull();
    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining('not a PEM private key'),
    );
  });

  it('refuses a non-RSA key', () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const log = logger();
    expect(
      resolveDkim({ selector: 's', privateKey: pem }, 'oralign.com.tn', log),
    ).toBeNull();
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('ed25519'));
  });

  it('accepts a 1024-bit key but recommends 2048', () => {
    const log = logger();
    const signing = resolveDkim(
      { selector: 's', privateKey: rsaPem(1024).pem },
      'oralign.com.tn',
      log,
    );
    expect(signing).not.toBeNull();
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('2048'));
  });

  it('warns when the signing domain does not align with From', () => {
    const log = logger();
    const signing = resolveDkim(
      { domain: 'aura-aligners.com', selector: 's', privateKey: key2048.pem },
      'oralign.com.tn',
      log,
    );
    expect(signing?.domainName).toBe('aura-aligners.com');
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('does NOT align'),
    );
  });
});

describe('dkimPublicKeyBase64', () => {
  it('is the SPKI base64 that DNS publishes as p=', () => {
    expect(dkimPublicKeyBase64(key2048.pem)).toBe(key2048.spki);
  });
});

describe('checkDomainAuth', () => {
  const signing = {
    domainName: 'oralign.com.tn',
    keySelector: 'oralign1',
    privateKey: key2048.pem,
  };

  function mockDns(records: Record<string, string[][]>) {
    return jest
      .spyOn(dns, 'resolveTxt')
      .mockImplementation((name: string) =>
        records[name]
          ? Promise.resolve(records[name])
          : Promise.reject(
              Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }),
            ),
      );
  }

  afterEach(() => jest.restoreAllMocks());

  it('reports a correct setup, joining a DKIM record split in chunks', async () => {
    const half = Math.floor(key2048.spki.length / 2);
    mockDns({
      'oralign.com.tn': [['v=spf1 include:_spf.topnetpro.com ~all']],
      '_dmarc.oralign.com.tn': [
        ['v=DMARC1; p=none; rua=mailto:dmarc@oralign.com.tn'],
      ],
      'oralign1._domainkey.oralign.com.tn': [
        [
          `v=DKIM1; k=rsa; p=${key2048.spki.slice(0, half)}`,
          key2048.spki.slice(half),
        ],
      ],
    });
    const log = logger();
    await checkDomainAuth('oralign.com.tn', signing, log);
    expect(log.warn).not.toHaveBeenCalled();
    expect(log.log).toHaveBeenCalledWith(
      expect.stringContaining('DKIM key matches'),
    );
  });

  it('flags the missing DMARC and a DKIM key that does not match ours', async () => {
    mockDns({
      'oralign.com.tn': [['v=spf1 include:_spf.topnetpro.com ~all']],
      'oralign1._domainkey.oralign.com.tn': [
        [`v=DKIM1; k=rsa; p=${rsaPem(2048).spki}`],
      ],
    });
    const log = logger();
    await checkDomainAuth('oralign.com.tn', signing, log);
    const message = String(log.warn.mock.calls[0]?.[0]);
    expect(message).toContain('no DMARC record');
    expect(message).toContain('does not match');
  });

  it('flags a missing DKIM key and two SPF records', async () => {
    mockDns({
      'oralign.com.tn': [
        ['v=spf1 include:_spf.topnetpro.com ~all'],
        ['v=spf1 include:_spf.mail.hostinger.com ~all'],
      ],
      '_dmarc.oralign.com.tn': [['v=DMARC1; p=none']],
    });
    const log = logger();
    await checkDomainAuth('oralign.com.tn', signing, log);
    const message = String(log.warn.mock.calls[0]?.[0]);
    expect(message).toContain('2 SPF records');
    expect(message).toContain('no DKIM key published');
  });

  it('does not look for DKIM when the app does not sign', async () => {
    const spy = mockDns({
      'oralign.com.tn': [['v=spf1 ~all']],
      '_dmarc.oralign.com.tn': [['v=DMARC1; p=none']],
    });
    const log = logger();
    await checkDomainAuth('oralign.com.tn', null, log);
    expect(spy.mock.calls.map(([name]) => name)).not.toContainEqual(
      expect.stringContaining('_domainkey'),
    );
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('never throws and gives up after the timeout', async () => {
    jest
      .spyOn(dns, 'resolveTxt')
      .mockImplementation(() => new Promise(() => undefined));
    const log = logger();
    await expect(
      checkDomainAuth('oralign.com.tn', null, log, 20),
    ).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('timed out'));
  });
});
