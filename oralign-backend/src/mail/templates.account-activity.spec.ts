import {
  escapeHtml,
  formatActivityDate,
  renderAccountDeactivatedEmail,
  renderAccountReactivatedEmail,
  renderInactivityWarningEmail,
} from './templates.account-activity';

const warning = {
  fullName: 'Dr <Amel> & Co',
  deadlineAt: '2026-12-31T23:30:00.000Z',
  anchorAt: '2026-05-01T09:00:00.000Z',
  daysLeft: 30,
  newOrderUrl: 'https://app.oralign.test/dashboard/orders/new',
};

describe('account activity e-mails', () => {
  it('dates are Tunis calendar days (UTC+1)', () => {
    // 23:30 UTC on Dec 31 is already Jan 1 in Tunis.
    expect(formatActivityDate('2026-12-31T23:30:00.000Z', 'fr')).toBe(
      '1 janvier 2027',
    );
    expect(formatActivityDate('2026-12-31T23:30:00.000Z', 'en')).toBe(
      '1 January 2027',
    );
  });

  it('the warning announces the date, the days left and the order link, FR and EN', () => {
    const fr = renderInactivityWarningEmail(warning, 'fr');
    expect(fr.subject).toBe(
      'Votre compte Oralign deviendra inactif le 1 janvier 2027',
    );
    expect(fr.html).toContain('30 jours');
    expect(fr.html).toContain('https://app.oralign.test/dashboard/orders/new');
    expect(fr.html).toContain('<html lang="fr"');

    const en = renderInactivityWarningEmail({ ...warning, daysLeft: 1 }, 'en');
    expect(en.subject).toBe(
      'Your Oralign account will become inactive on 1 January 2027',
    );
    expect(en.html).toContain('1 day');
  });

  it('escapes the name', () => {
    const { html } = renderInactivityWarningEmail(warning, 'fr');
    expect(html).toContain('Dr &lt;Amel&gt; &amp; Co');
    expect(html).not.toContain('<Amel>');
    expect(escapeHtml(`"'`)).toBe('&quot;&#39;');
  });

  it('the deactivation says what stays open and how to reactivate', () => {
    const { subject, html } = renderAccountDeactivatedEmail(
      {
        fullName: 'Dr Amel',
        dashboardUrl: 'https://app.oralign.test/dashboard',
        supportUrl: 'https://app.oralign.test/dashboard/support',
      },
      'fr',
    );
    expect(subject).toBe('Votre compte Oralign est désormais inactif');
    expect(html).toContain('régler vos paiements');
    expect(html).toContain('https://app.oralign.test/dashboard/support');
  });

  it('the reactivation uses the house wording', () => {
    const fr = renderAccountReactivatedEmail(
      { fullName: 'Dr Amel', newOrderUrl: 'https://x.test/new' },
      'fr',
    );
    const en = renderAccountReactivatedEmail(
      { fullName: 'Dr Amel', newOrderUrl: 'https://x.test/new' },
      'en',
    );
    expect(fr.html).toContain('aligneurs transparents');
    expect(en.html).toContain('transparent aligner');
    expect(`${fr.html}${en.html}`).not.toMatch(/invisible|invisalign/i);
  });
});
