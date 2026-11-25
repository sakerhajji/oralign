import type { PrismaService } from '../prisma/prisma.service';
import { MailService } from './mail.service';
import {
  renderProductionDeliveredForDoctorEmail,
  renderProductionDeliveryCancelledForDoctorEmail,
  type ProductionDeliveryEmailArgs,
} from './templates';

const ARGS: ProductionDeliveryEmailArgs = {
  doctorName: 'Dr Amel',
  orderCode: 'ORD-0012',
  patientName: 'Amel Ben Salah',
  archLabel: 'Supérieure et inférieure',
  stepsLabel: '1 à 10',
  quantityLabel: '10 aligneurs par arcade (20 au total)',
  performedAtLabel: '25/11/2026 à 14:30',
  recipientLabel: 'Coursier (Ali)',
  progress: [
    {
      label: 'Arcade supérieure',
      value: 'Livraison partielle : 10 sur 24, reste 14',
    },
    { label: 'Arcade inférieure', value: 'Livraison complète' },
  ],
  dashboardUrl: 'https://app.example/dashboard/orders/o-1',
};

function makeService(transporter: { sendMail: jest.Mock } | null) {
  const service = new MailService({} as unknown as PrismaService);
  // The test env has no SMTP: install (or remove) the transport by hand.
  (service as unknown as { transporter: unknown }).transporter = transporter;
  return service;
}

const text = (html: string) => html.replace(/\s+/g, ' ');

describe('MailService — lab production e-mails report whether SMTP accepted them', () => {
  it.each([
    ['sendProductionDeliveredToDoctor', 'Aligneurs livrés — ORD-0012'],
    ['sendProductionDeliveryCancelledToDoctor', 'Livraison annulée — ORD-0012'],
  ] as const)('%s: true on a real send', async (method, subject) => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'm-1' });
    const service = makeService({ sendMail });
    await expect(
      service[method]({ ...ARGS, to: 'amel@clinic.tn', lang: 'fr' }),
    ).resolves.toBe(true);
    const mail = (sendMail.mock.calls as unknown[][])[0][0] as {
      to: string;
      subject: string;
    };
    expect(mail.to).toBe('amel@clinic.tn');
    expect(mail.subject).toBe(subject);
  });

  it('false when SMTP is not configured (nothing was sent)', async () => {
    const service = makeService(null);
    await expect(
      service.sendProductionDeliveredToDoctor({
        ...ARGS,
        to: 'amel@clinic.tn',
        lang: 'fr',
      }),
    ).resolves.toBe(false);
  });

  it('rethrows a real SMTP failure', async () => {
    const service = makeService({
      sendMail: jest.fn().mockRejectedValue(new Error('550 refused')),
    });
    await expect(
      service.sendProductionDeliveryCancelledToDoctor({
        ...ARGS,
        to: 'amel@clinic.tn',
        lang: 'en',
      }),
    ).rejects.toThrow('550 refused');
  });
});

describe('renderProductionDeliveredForDoctorEmail', () => {
  it('French: the delivery facts, then the progress per arch, and the order link', () => {
    const { html, subject } = renderProductionDeliveredForDoctorEmail(
      ARGS,
      'fr',
    );
    const t = text(html);
    expect(subject).toBe('Aligneurs livrés — ORD-0012');
    expect(t).toContain('Bonjour Dr Amel');
    expect(t).toContain(
      'Le laboratoire a livré des aligneurs pour la commande <strong>ORD-0012</strong>',
    );
    for (const fact of [
      'Supérieure et inférieure',
      '1 à 10',
      '10 aligneurs par arcade (20 au total)',
      '25/11/2026 à 14:30',
      'Coursier (Ali)',
      'Avancement du traitement',
      'Livraison partielle : 10 sur 24, reste 14',
      'Livraison complète',
      'Remis à',
    ]) {
      expect(t).toContain(fact);
    }
    expect(t.indexOf('Remis à')).toBeLessThan(
      t.indexOf('Avancement du traitement'),
    );
    expect(html).toContain('href="https://app.example/dashboard/orders/o-1"');
    expect(html).toContain('<html lang="fr"');
  });

  it('English labels', () => {
    const { html, subject } = renderProductionDeliveredForDoctorEmail(
      ARGS,
      'en',
    );
    expect(subject).toBe('Aligners delivered — ORD-0012');
    expect(html).toContain('Handed to');
    expect(html).toContain('Treatment progress');
    expect(html).toContain('View the order');
  });

  it('escapes every practitioner-visible value, preheader included', () => {
    const { html } = renderProductionDeliveredForDoctorEmail(
      {
        ...ARGS,
        patientName: '<img src=x onerror=alert(1)>',
        recipientLabel: 'Coursier (<b>Ali</b>)',
      },
      'fr',
    );
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>Ali</b>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('leaves the progress table out when no arch is reported', () => {
    const { html } = renderProductionDeliveredForDoctorEmail(
      { ...ARGS, progress: [] },
      'fr',
    );
    expect(html).not.toContain('Avancement du traitement');
  });
});

describe('renderProductionDeliveryCancelledForDoctorEmail', () => {
  it('says which delivery no longer holds and that the progress is up to date, never why', () => {
    const fr = renderProductionDeliveryCancelledForDoctorEmail(ARGS, 'fr');
    expect(fr.subject).toBe('Livraison annulée — ORD-0012');
    expect(text(fr.html)).toContain('a annulé la livraison ci-dessous');
    expect(text(fr.html)).toContain("l'avancement indiqué ici est à jour");
    // Word boundaries: "livraison" contains "raison".
    expect(fr.html).not.toMatch(/\bmotif\b|\braison\b/i);

    const en = renderProductionDeliveryCancelledForDoctorEmail(ARGS, 'en');
    expect(en.subject).toBe('Delivery cancelled — ORD-0012');
    expect(en.html).toContain('Cancelled delivery');
    expect(en.html).not.toMatch(/\breason\b/i);
  });
});
