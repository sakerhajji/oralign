import {
  DeliveryRecipient,
  ProductionArch,
  ProductionNoticeKind,
} from '@prisma/client';
import type { Lang, LangText } from '../../common/i18n/lang';
import { businessTimeOf, businessToday } from '../../common/time/business-day';
import type { ProductionDeliveryEmailArgs } from '../../mail/templates';
import type {
  ActCounters,
  ArchPair,
  PlannedTotals,
} from '../production.contract';
import { PRODUCTION_ARCHES } from '../production.constants';

/**
 * What a practitioner notice SAYS, for every channel (CONTRACT.md §3.5).
 * Pure: no I/O, no clock. The dispatcher loads the rows, the planned
 * totals and the progress at send time and hands them here; the channels
 * turn the result into a bell row or an e-mail.
 *
 * Content rules:
 *   • the delivery: arches, steps, quantity, Tunis date and time, recipient;
 *   • the progress per TREATED arch: "livraison partielle : X sur Y,
 *     reste Z", "livraison complète", or "X livrés à ce jour" when the
 *     final total is not known;
 *   • never the cancel reason (owner decision D8) and never an amount:
 *     the inputs below simply do not carry them.
 */

/** One delivery row a notice reports on: live for `delivered`, cancelled for `correction`. */
export interface NoticeRow {
  arch: ProductionArch;
  stepFrom: number;
  stepTo: number;
  quantity: number;
  performedAt: Date;
  deliveredTo: DeliveryRecipient | null;
  deliveredToName: string | null;
}

/** Where one treated arch stands after this delivery (or its cancel). */
export type ArchProgress =
  | {
      arch: ProductionArch;
      state: 'partial';
      delivered: number;
      total: number;
      remaining: number;
    }
  | {
      arch: ProductionArch;
      state: 'complete';
      delivered: number;
      total: number;
    }
  | { arch: ProductionArch; state: 'to_date'; delivered: number };

/** Language-neutral content of one notice. */
export interface NoticeFacts {
  kind: ProductionNoticeKind;
  orderCode: string;
  patientName: string;
  /** The reported rows, upper arch first. Never empty. */
  rows: NoticeRow[];
  /** One entry per treated arch, upper first. */
  progress: ArchProgress[];
}

/** The display-ready values both channels print, in one language. */
export interface NoticeLabels {
  archLabel: string;
  stepsLabel: string;
  quantityLabel: string;
  performedAtLabel: string;
  recipientLabel: string;
  progress: Array<{ label: string; value: string }>;
}

/**
 * Per treated arch (planned[arch] !== null). Only the APPROVED PLAN's total
 * is announced: a provisional one (the pack's ceiling, the case estimate)
 * would tell the practitioner a count the lab itself flags as uncertain,
 * so it reads "X livrés à ce jour" like an unknown total.
 */
export function archProgressOf(
  planned: PlannedTotals,
  counters: ArchPair<ActCounters>,
): ArchProgress[] {
  return PRODUCTION_ARCHES.flatMap((arch): ArchProgress[] => {
    const plan = planned[arch];
    if (!plan) return [];
    const delivered = counters[arch].delivered;
    const total = plan.provisional ? null : plan.total;
    if (total == null) return [{ arch, state: 'to_date', delivered }];
    if (delivered >= total) {
      return [{ arch, state: 'complete', delivered, total }];
    }
    return [
      {
        arch,
        state: 'partial',
        delivered,
        total,
        remaining: total - delivered,
      },
    ];
  });
}

export function buildNoticeFacts(input: {
  kind: ProductionNoticeKind;
  orderCode: string;
  patientName: string;
  rows: readonly NoticeRow[];
  planned: PlannedTotals;
  counters: ArchPair<ActCounters>;
}): NoticeFacts {
  if (input.rows.length === 0) {
    throw new Error('A production notice reports on at least one row.');
  }
  const rank = (arch: ProductionArch) => PRODUCTION_ARCHES.indexOf(arch);
  return {
    kind: input.kind,
    orderCode: input.orderCode,
    patientName: input.patientName,
    rows: [...input.rows].sort((a, b) => rank(a.arch) - rank(b.arch)),
    progress: archProgressOf(input.planned, input.counters),
  };
}

// ── Wording (the ONE place, both channels) ─────────────────────────────

interface Words {
  arch: Record<ProductionArch, string>;
  archShort: Record<ProductionArch, string>;
  archRow: Record<ProductionArch, string>;
  both: string;
  range: (from: number, to: number) => string;
  aligners: (count: number) => string;
  perArch: (count: number, total: number) => string;
  at: (day: string, time: string) => string;
  recipient: Record<DeliveryRecipient, string>;
  partial: (delivered: number, total: number, remaining: number) => string;
  complete: string;
  toDate: (delivered: number) => string;
}

const WORDS: Record<Lang, Words> = {
  en: {
    arch: { upper: 'Upper', lower: 'Lower' },
    archShort: { upper: 'upper', lower: 'lower' },
    archRow: { upper: 'Upper arch', lower: 'Lower arch' },
    both: 'Upper and lower',
    range: (from, to) => (from === to ? `${from}` : `${from} to ${to}`),
    aligners: (count) => (count === 1 ? '1 aligner' : `${count} aligners`),
    perArch: (count, total) =>
      `${count === 1 ? '1 aligner' : `${count} aligners`} per arch (${total} in total)`,
    at: (day, time) => `${day} at ${time}`,
    recipient: {
      practitioner: 'Practitioner',
      courier: 'Courier',
      patient: 'Patient',
    },
    partial: (delivered, total, remaining) =>
      `partial delivery: ${delivered} of ${total}, ${remaining} remaining`,
    complete: 'delivery complete',
    toDate: (delivered) => `${delivered} delivered to date`,
  },
  fr: {
    arch: { upper: 'Supérieure', lower: 'Inférieure' },
    archShort: { upper: 'sup.', lower: 'inf.' },
    archRow: { upper: 'Arcade supérieure', lower: 'Arcade inférieure' },
    both: 'Supérieure et inférieure',
    range: (from, to) => (from === to ? `${from}` : `${from} à ${to}`),
    // French: 0 and 1 take the singular.
    aligners: (count) => `${count} ${count > 1 ? 'aligneurs' : 'aligneur'}`,
    perArch: (count, total) =>
      `${count} ${count > 1 ? 'aligneurs' : 'aligneur'} par arcade (${total} au total)`,
    at: (day, time) => `${day} à ${time}`,
    recipient: {
      practitioner: 'Praticien',
      courier: 'Coursier',
      patient: 'Patient',
    },
    partial: (delivered, total, remaining) =>
      `livraison partielle : ${delivered} sur ${total}, reste ${remaining}`,
    complete: 'livraison complète',
    toDate: (delivered) =>
      `${delivered} ${delivered > 1 ? 'livrés' : 'livré'} à ce jour`,
  },
};

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

/** 'YYYY-MM-DD' (Tunis) → 'DD/MM/YYYY', the way both languages print it here. */
function displayDay(instant: Date): string {
  const [year, month, day] = businessToday(instant).split('-');
  return `${day}/${month}/${year}`;
}

function sameAcrossRows<T>(
  rows: readonly NoticeRow[],
  pick: (row: NoticeRow) => T,
) {
  return rows.every((row) => pick(row) === pick(rows[0]));
}

function progressPhrase(progress: ArchProgress, w: Words): string {
  switch (progress.state) {
    case 'partial':
      return w.partial(progress.delivered, progress.total, progress.remaining);
    case 'complete':
      return w.complete;
    case 'to_date':
      return w.toDate(progress.delivered);
  }
}

export function noticeLabels(facts: NoticeFacts, lang: Lang): NoticeLabels {
  const w = WORDS[lang];
  const { rows } = facts;
  const first = rows[0];

  const archLabel = rows.length > 1 ? w.both : w.arch[first.arch];

  const stepsLabel = sameAcrossRows(rows, (r) => `${r.stepFrom}-${r.stepTo}`)
    ? w.range(first.stepFrom, first.stepTo)
    : rows
        .map((r) => `${w.archShort[r.arch]} ${w.range(r.stepFrom, r.stepTo)}`)
        .join(' · ');

  let quantityLabel: string;
  if (rows.length === 1) {
    quantityLabel = w.aligners(first.quantity);
  } else if (sameAcrossRows(rows, (r) => r.quantity)) {
    quantityLabel = w.perArch(first.quantity, first.quantity * rows.length);
  } else {
    quantityLabel = rows
      .map((r) => `${w.archShort[r.arch]} ${w.aligners(r.quantity)}`)
      .join(' · ');
  }

  // The rows of one declaration share the instant and the recipient.
  const performedAtLabel = w.at(
    displayDay(first.performedAt),
    businessTimeOf(first.performedAt),
  );
  const name = first.deliveredToName?.trim();
  const recipientLabel = first.deliveredTo
    ? name
      ? `${w.recipient[first.deliveredTo]} (${name})`
      : w.recipient[first.deliveredTo]
    : '—';

  return {
    archLabel,
    stepsLabel,
    quantityLabel,
    performedAtLabel,
    recipientLabel,
    progress: facts.progress.map((p) => ({
      label: w.archRow[p.arch],
      value: capitalize(progressPhrase(p, w)),
    })),
  };
}

// ── Channel renderings ─────────────────────────────────────────────────

function inAppText(
  facts: NoticeFacts,
  lang: Lang,
): { title: string; message: string } {
  const w = WORDS[lang];
  const l = noticeLabels(facts, lang);
  const arches = l.archLabel.toLowerCase();
  const progress = facts.progress
    .map((p) => `${w.archRow[p.arch]} — ${progressPhrase(p, w)}`)
    .join(' · ');
  const delivered = facts.kind === ProductionNoticeKind.delivered;
  const head =
    lang === 'fr'
      ? delivered
        ? `Étapes ${l.stepsLabel} (${arches}) livrées le ${l.performedAtLabel}`
        : `La livraison des étapes ${l.stepsLabel} (${arches}) du ${l.performedAtLabel} a été annulée`
      : delivered
        ? `Steps ${l.stepsLabel} (${arches}) delivered on ${l.performedAtLabel}`
        : `The delivery of steps ${l.stepsLabel} (${arches}) on ${l.performedAtLabel} was cancelled`;
  const title =
    lang === 'fr'
      ? `${delivered ? 'Aligneurs livrés' : 'Livraison annulée'} — ${facts.orderCode}`
      : `${delivered ? 'Aligners delivered' : 'Delivery cancelled'} — ${facts.orderCode}`;
  const message = [head, progress, `patient ${facts.patientName}`]
    .filter(Boolean)
    .join(' · ');
  return { title, message };
}

/** The bell row, in both languages (NotificationsService picks the recipient's). */
export function renderInAppNotice(facts: NoticeFacts): {
  title: LangText;
  message: LangText;
} {
  const en = inAppText(facts, 'en');
  const fr = inAppText(facts, 'fr');
  return {
    title: { en: en.title, fr: fr.title },
    message: { en: en.message, fr: fr.message },
  };
}

/** The e-mail template's arguments, in the practitioner's language. */
export function renderEmailNotice(
  facts: NoticeFacts,
  lang: Lang,
  context: { doctorName: string; dashboardUrl: string },
): ProductionDeliveryEmailArgs {
  return {
    doctorName: context.doctorName,
    orderCode: facts.orderCode,
    patientName: facts.patientName,
    ...noticeLabels(facts, lang),
    dashboardUrl: context.dashboardUrl,
  };
}
