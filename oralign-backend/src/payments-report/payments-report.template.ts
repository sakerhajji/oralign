import { PaymentRecordStatus, Prisma } from '@prisma/client';
import { BUSINESS_TIME_ZONE } from '../common/time/business-day';
import {
  METHOD_ORDER,
  addMethodTallies,
  emptyMethodTallies,
  sumTallies,
  type MethodTallies,
  type Tally,
} from '../payments/services/payments-summary.service';
import { PaymentsReportKind } from './dto/payments-report.dto';
import {
  paymentsReportLabels,
  type PaymentsReportLabels,
  type ReportSectionKind,
} from './payments-report.i18n';
import type {
  PaymentsReportModel,
  ReportCompany,
  ReportCriteria,
  ReportPeriod,
  ReportRow,
  ReportSection,
} from './payments-report.model';

/**
 * The payments report as one self-contained A4 HTML document, printed by
 * PdfRendererService. It follows the receipts' house style (invoice-pdf):
 * the logo alone at the top, an ink-black rule, uppercase spaced titles,
 * black table headers repeated on every page, hairline grey boxes — with
 * the brand yellow of the ORALIGN logo as the only accent.
 *
 * Pure functions: no I/O, every value escaped, amounts printed from
 * Decimals (never through a float).
 */

const NBSP = String.fromCharCode(0xa0);
const INK = '#111111';
const BRAND_YELLOW = '#FECA16';
const FONT_STACK = 'Inter, Roboto, Arial, "DejaVu Sans", sans-serif';

/** Page margins: the running footer prints inside the bottom one. */
export const REPORT_PAGE_MARGIN = {
  top: '11mm',
  right: '11mm',
  bottom: '17mm',
  left: '11mm',
};

// ─── Formatting ─────────────────────────────────────────────────────

export function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

/**
 * "1 234,500": exact (from the Decimal's own digits), 3 decimals for the
 * millimes, no-break spaces between thousands and a decimal comma — the
 * dashboard's money format, in both languages.
 */
export function formatMoneyValue(amount: Prisma.Decimal): string {
  const [whole, millimes] = amount.abs().toFixed(3).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const negative = amount.isNegative() && !amount.isZero();
  return `${negative ? '−' : ''}${grouped},${millimes}`;
}

export function formatMoney(amount: Prisma.Decimal, currency: string): string {
  return `${formatMoneyValue(amount)}${NBSP}${currency}`;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function dateFormatter(
  locale: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${locale}|${timeZone}|${JSON.stringify(options)}`;
  let cached = formatters.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat(locale, { ...options, timeZone });
    formatters.set(key, cached);
  }
  return cached;
}

/** An instant's Tunis calendar day, numeric: "06/11/2026". */
export function formatInstantDay(
  instant: Date,
  labels: PaymentsReportLabels,
): string {
  return dateFormatter(labels.locale, BUSINESS_TIME_ZONE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(instant);
}

/** An instant's Tunis wall-clock time, 24-hour: "14:32". */
export function formatInstantTime(
  instant: Date,
  labels: PaymentsReportLabels,
): string {
  return dateFormatter(labels.locale, BUSINESS_TIME_ZONE, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant);
}

/** A business day ('YYYY-MM-DD') in words: "1er novembre 2026" / "1 November 2026". */
export function formatCalendarDayLong(
  day: string,
  labels: PaymentsReportLabels,
): string {
  const [year, month, date] = day.split('-').map(Number);
  const text = dateFormatter(labels.locale, 'UTC', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, date)));
  return labels.locale.startsWith('fr') && date === 1
    ? text.replace(/^1(?=\s)/, '1er')
    : text;
}

/** A business day, numeric: "01/11/2026". */
function formatCalendarDayShort(
  day: string,
  labels: PaymentsReportLabels,
): string {
  const [year, month, date] = day.split('-').map(Number);
  return dateFormatter(labels.locale, 'UTC', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, date)));
}

type StatusTone = 'ok' | 'wait' | 'ko';

const STATUS_TONE: Record<PaymentRecordStatus, StatusTone> = {
  success: 'ok',
  pending: 'wait',
  unknown: 'wait',
  awaiting_confirmation: 'wait',
  failed: 'ko',
  rejected: 'ko',
  cancelled: 'ko',
  expired: 'ko',
};

/** The statuses in the order a reader scans them: received, waiting, lost. */
const STATUS_ORDER: readonly PaymentRecordStatus[] = [
  PaymentRecordStatus.success,
  PaymentRecordStatus.awaiting_confirmation,
  PaymentRecordStatus.pending,
  PaymentRecordStatus.unknown,
  PaymentRecordStatus.failed,
  PaymentRecordStatus.rejected,
  PaymentRecordStatus.cancelled,
  PaymentRecordStatus.expired,
];

// ─── Document ───────────────────────────────────────────────────────

export function renderPaymentsReportHtml(model: PaymentsReportModel): string {
  const labels = paymentsReportLabels(model.lang);
  const title = labels.documentTitle.toUpperCase();
  const brand = model.brandName.toUpperCase();
  return `<!doctype html>
<html lang="${escapeHtml(model.lang)}" dir="ltr">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(`${brand} — ${labels.documentTitle}`)}</title>
    <style>${STYLES}</style>
  </head>
  <body>
    <main class="document">
      <header class="masthead">
        ${
          model.logo
            ? `<img class="logo" src="${escapeHtml(model.logo.dataUrl)}" alt="${escapeHtml(brand)}" />`
            : `<div class="brand-word">${escapeHtml(brand)}</div>`
        }
      </header>

      <section class="docrow">
        <div class="doc-title">
          <div class="eyebrow">${escapeHtml(brand)}</div>
          <h1 class="title">${escapeHtml(title)}</h1>
          <div class="kind"><span class="kind-dot"></span>${escapeHtml(labels.kinds[model.kind])}</div>
        </div>
        ${renderMeta(model, labels)}
      </section>

      <section class="section keep party-grid">
        ${renderIssuer(model.company, model.brandName, labels)}
        ${renderCriteria(model, labels)}
      </section>

      ${renderSummary(model, labels)}

      ${model.sections.map((section) => renderSection(model, section, labels)).join('\n')}

      <footer class="closing">
        <div>${escapeHtml(labels.endOfReport)}</div>
        <div>${escapeHtml(labels.automaticNotice)}</div>
      </footer>
    </main>
  </body>
</html>`;
}

/**
 * The running footer Chromium prints on every page: the issuer on the
 * left, the report and "Page X / Y" on the right. Inline styles only:
 * the document's stylesheet does not reach the page margins.
 */
export function renderPaymentsReportFooter(model: PaymentsReportModel): string {
  const labels = paymentsReportLabels(model.lang);
  const issuer = issuerLine(model.company, model.brandName, labels);
  const report = `${labels.documentTitle} · ${periodShort(model.period, labels)}`;
  // Two lines: the issuer in full (the tax number is never cut), then the
  // report on the left and the page number on the right.
  return `<div style="width:100%;box-sizing:border-box;padding:0 11mm;font-family:${FONT_STACK.replace(/"/g, "'")};font-size:6.8px;line-height:1.4;color:#5f6368;-webkit-print-color-adjust:exact;">
  <div style="border-top:0.6px solid #d6d8dc;padding-top:3px;overflow-wrap:anywhere;">${escapeHtml(issuer)}</div>
  <div style="display:flex;justify-content:space-between;gap:12px;margin-top:1px;">
    <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(report)}</span>
    <span style="flex:none;white-space:nowrap;color:#111111;font-weight:600;">${escapeHtml(labels.page)} <span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>
</div>`;
}

/**
 * "Oralign_Rapport_Paiements_Honoraires_2026-11-01_2026-11-06.pdf": the
 * brand, the report, its kind and its days — ASCII only, so it survives
 * every browser and file system.
 */
export function paymentsReportFileName(model: PaymentsReportModel): string {
  const fr = model.lang === 'fr';
  const kinds: Record<PaymentsReportKind, string> = fr
    ? {
        [PaymentsReportKind.treatmentFee]: 'Honoraires',
        [PaymentsReportKind.installment]: 'Echelonnes',
        [PaymentsReportKind.consolidated]: 'Consolide',
      }
    : {
        [PaymentsReportKind.treatmentFee]: 'Treatment-fees',
        [PaymentsReportKind.installment]: 'Installments',
        [PaymentsReportKind.consolidated]: 'Consolidated',
      };
  const start =
    model.period.allDates || !model.period.from
      ? fr
        ? 'toutes-dates'
        : 'all-dates'
      : model.period.from;
  const base = fr ? 'Oralign_Rapport_Paiements' : 'Oralign_Payments_Report';
  return `${base}_${kinds[model.kind]}_${start}_${model.period.to}.pdf`;
}

// ─── Header blocks ──────────────────────────────────────────────────

function renderMeta(
  model: PaymentsReportModel,
  labels: PaymentsReportLabels,
): string {
  const generatedOn = labels.generatedAt(
    formatCalendarDayLong(businessDayOfInstant(model.generatedAt), labels),
    formatInstantTime(model.generatedAt, labels),
  );
  const rows: [string, string][] = [];
  const { period } = model;
  if (period.allDates || !period.from) {
    rows.push([
      labels.period,
      `${labels.allDates} (${labels.upTo(formatCalendarDayLong(period.to, labels))})`,
    ]);
  } else {
    rows.push([labels.from, formatCalendarDayLong(period.from, labels)]);
    rows.push([labels.to, formatCalendarDayLong(period.to, labels)]);
  }
  rows.push([labels.generatedOn, generatedOn]);
  if (model.generatedBy) rows.push([labels.generatedBy, model.generatedBy]);
  rows.push([labels.timeZone, labels.timeZoneValue]);
  return `<dl class="meta">
          ${rows
            .map(
              ([label, value]) =>
                `<div class="meta-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`,
            )
            .join('')}
        </dl>`;
}

function renderIssuer(
  company: ReportCompany,
  brandName: string,
  labels: PaymentsReportLabels,
): string {
  const name = company.name ?? brandName;
  const identity = [company.tradeName, company.legalForm]
    .filter((part): part is string => Boolean(part) && part !== name)
    .join(' · ');
  const place = [company.city, company.country].filter(Boolean).join(', ');
  const contact = [company.phone, company.email].filter(Boolean).join(' · ');
  const lines: { text: string; strong?: boolean }[] = [
    { text: name, strong: true },
    { text: identity },
    { text: company.address ?? '' },
    { text: place },
    { text: contact },
    { text: company.website ?? '' },
    {
      text: company.taxNumber
        ? labels.labelled(labels.taxNumber, company.taxNumber)
        : '',
    },
    {
      text: company.tradeRegister
        ? labels.labelled(labels.tradeRegister, company.tradeRegister)
        : '',
    },
  ];
  return `<article class="box">
          <h2 class="box-title">${escapeHtml(labels.issuer)}</h2>
          ${lines
            .filter((line) => line.text.trim() !== '')
            .map(
              (line) =>
                `<p class="box-line${line.strong ? ' strong' : ''}">${escapeHtml(line.text)}</p>`,
            )
            .join('')}
        </article>`;
}

/**
 * The filters the report was built with. A single-kind report lists them;
 * a consolidated one sets the two tabs' filters side by side (each tab
 * keeps its own search and filters on the desk).
 */
function renderCriteria(
  model: PaymentsReportModel,
  labels: PaymentsReportLabels,
): string {
  const consolidated = model.sections.length > 1;
  const hasInstallments = model.sections.some((s) => s.kind === 'installment');
  type Line = {
    label: string;
    value: (criteria: ReportCriteria, kind: ReportSectionKind) => string;
  };
  const lines: Line[] = [];
  if (model.showPractitioner) {
    lines.push({
      label: labels.practitioner,
      value: (c) => c.practitioner ?? labels.allPractitioners,
    });
  }
  lines.push(
    {
      label: labels.paymentMethod,
      value: (c) =>
        c.methods.length
          ? METHOD_ORDER.filter((m) => c.methods.includes(m))
              .map((m) => labels.methods[m])
              .join(', ')
          : labels.allMethods,
    },
    {
      label: labels.status,
      value: (c) =>
        c.statuses.length
          ? STATUS_ORDER.filter((s) => c.statuses.includes(s))
              .map((s) => labels.statuses[s])
              .join(', ')
          : labels.allStatuses,
    },
  );
  if (hasInstallments) {
    lines.push({
      label: labels.installment,
      value: (c, kind) =>
        kind !== 'installment'
          ? '—'
          : c.installment &&
              (c.installment.min !== null || c.installment.max !== null)
            ? labels.installmentRange(c.installment.min, c.installment.max)
            : labels.allInstallments,
    });
  }
  lines.push({
    label: labels.search,
    value: (c) => (c.search ? quote(c.search, model.lang) : labels.noSearch),
  });

  const head = consolidated
    ? `<tr><th></th>${model.sections
        .map((s) => `<th>${escapeHtml(labels.kinds[s.kind])}</th>`)
        .join('')}</tr>`
    : '';
  const body = [
    `<tr><th scope="row">${escapeHtml(labels.reportType)}</th><td${
      consolidated ? ` colspan="${model.sections.length}"` : ''
    }>${escapeHtml(labels.kinds[model.kind])}</td></tr>`,
    ...lines.map(
      (line) =>
        `<tr><th scope="row">${escapeHtml(line.label)}</th>${model.sections
          .map((s) => `<td>${escapeHtml(line.value(s.criteria, s.kind))}</td>`)
          .join('')}</tr>`,
    ),
  ].join('');
  return `<article class="box">
          <h2 class="box-title">${escapeHtml(labels.criteria)}</h2>
          <table class="criteria${consolidated ? ' two' : ''}">
            ${head ? `<thead>${head}</thead>` : ''}
            <tbody>${body}</tbody>
          </table>
        </article>`;
}

// ─── Financial summary ──────────────────────────────────────────────

function renderSummary(
  model: PaymentsReportModel,
  labels: PaymentsReportLabels,
): string {
  const { currency } = model;
  const money = (tally: Tally) =>
    escapeHtml(formatMoney(tally.amount, currency));
  const consolidated = model.sections.length > 1;
  let table: string;

  if (!consolidated) {
    const collected = model.sections[0]?.collected ?? emptyMethodTallies();
    const total = sumTallies(collected);
    table = `<table class="summary">
        <thead>
          <tr>
            <th>${escapeHtml(labels.paymentMethod)}</th>
            <th class="num">${escapeHtml(labels.count)}</th>
            <th class="num">${escapeHtml(labels.collectedAmount)}</th>
          </tr>
        </thead>
        <tbody>
          ${METHOD_ORDER.map(
            (method) => `<tr>
            <td>${escapeHtml(labels.methods[method])}</td>
            <td class="num">${collected[method].count}</td>
            <td class="num">${money(collected[method])}</td>
          </tr>`,
          ).join('')}
          <tr class="total">
            <td>${escapeHtml(labels.totalCollected.toUpperCase())}</td>
            <td class="num">${total.count}</td>
            <td class="num">${money(total)}</td>
          </tr>
        </tbody>
      </table>`;
  } else {
    // Each kind in its own columns, then both: the overall total adds two
    // disjoint sums (installments are Payment rows, fees live on the
    // orders), so nothing is counted twice.
    const kinds = model.sections.map((s) => s.collected);
    const both = kinds.reduce<MethodTallies>(
      addMethodTallies,
      emptyMethodTallies(),
    );
    const cells = (tally: Tally) =>
      `<td class="num">${tally.count}</td><td class="num">${money(tally)}</td>`;
    // The method column wide enough for "TOTAL ENCAISSÉ" on one line; each
    // kind gets a narrow count and a wide amount.
    const groups = model.sections.length + 1;
    const countWidth = 7;
    const amountWidth = (100 - 21 - groups * countWidth) / groups;
    const columns = [
      21,
      ...Array.from({ length: groups }, () => [countWidth, amountWidth]).flat(),
    ];
    table = `<table class="summary consolidated">
        <colgroup>${columns.map((w) => `<col style="width:${w.toFixed(2)}%" />`).join('')}</colgroup>
        <thead>
          <tr>
            <th rowspan="2">${escapeHtml(labels.paymentMethod)}</th>
            ${model.sections
              .map(
                (s) =>
                  `<th colspan="2" class="group">${escapeHtml(labels.kinds[s.kind])}</th>`,
              )
              .join('')}
            <th colspan="2" class="group">${escapeHtml(labels.totalCollected)}</th>
          </tr>
          <tr>
            ${[...model.sections, null]
              .map(
                // "Montant": the group heading above already says "collected".
                () =>
                  `<th class="num">${escapeHtml(labels.countShort)}</th><th class="num">${escapeHtml(labels.amount)}</th>`,
              )
              .join('')}
          </tr>
        </thead>
        <tbody>
          ${METHOD_ORDER.map(
            (method) => `<tr>
            <td>${escapeHtml(labels.methods[method])}</td>
            ${kinds.map((tallies) => cells(tallies[method])).join('')}
            ${cells(both[method])}
          </tr>`,
          ).join('')}
          <tr class="total">
            <td>${escapeHtml(labels.totalCollected.toUpperCase())}</td>
            ${kinds.map((tallies) => cells(sumTallies(tallies))).join('')}
            ${cells(sumTallies(both))}
          </tr>
        </tbody>
      </table>`;
  }

  const statusLines = model.sections
    .map((section) => {
      const counts = statusCounts(section.rows);
      if (counts.length === 0) return '';
      const prefix = consolidated ? `${labels.kinds[section.kind]} — ` : '';
      return `<p class="status-line">${escapeHtml(prefix)}${escapeHtml(labels.colon(labels.statusesInDetails))} ${counts
        .map(
          ([status, count]) =>
            `<span class="status-chip ${STATUS_TONE[status]}">${escapeHtml(labels.statuses[status])} ${count}</span>`,
        )
        .join(' ')}</p>`;
    })
    .join('');

  return `<section class="section keep">
      <h2 class="section-title">${escapeHtml(labels.summaryTitle)}</h2>
      ${table}
      <p class="note">${escapeHtml(labels.summaryNote)}</p>
      ${statusLines}
    </section>`;
}

/** How many rows of each status the details hold, in reading order. */
function statusCounts(rows: ReportRow[]): [PaymentRecordStatus, number][] {
  const counts = new Map<PaymentRecordStatus, number>();
  for (const row of rows) {
    if (row.status) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  }
  return STATUS_ORDER.filter((status) => counts.has(status)).map((status) => [
    status,
    counts.get(status) ?? 0,
  ]);
}

// ─── Details ────────────────────────────────────────────────────────

/** Column widths (%), sized for DejaVu Sans, the Docker image's font. */
const COLUMNS_WITH_PRACTITIONER = [11, 15, 13, 13, 9, 13, 14, 12];
const COLUMNS_OWN = [12, 17, 18, 10, 14, 15, 14];

function renderSection(
  model: PaymentsReportModel,
  section: ReportSection,
  labels: PaymentsReportLabels,
): string {
  const title = `${labels.detailsTitle} — ${labels.kinds[section.kind]}`;
  const head = `<div class="section-head">
        <h2 class="section-title">${escapeHtml(title)}</h2>
        <span class="row-count">${escapeHtml(labels.rows(section.rows.length))}</span>
      </div>`;
  if (section.rows.length === 0) {
    return `<section class="section details">
      ${head}
      <div class="empty">${escapeHtml(labels.empty)}</div>
    </section>`;
  }

  const widths = model.showPractitioner
    ? COLUMNS_WITH_PRACTITIONER
    : COLUMNS_OWN;
  const headers = [
    labels.columns.date,
    labels.columns.order,
    ...(model.showPractitioner ? [labels.columns.practitioner] : []),
    labels.columns.patient,
    labels.columns.method,
    labels.columns.status,
    labels.columns.transaction,
    labels.columns.amount,
  ];
  const collected = sumTallies(section.collected);
  return `<section class="section details">
      ${head}
      <table class="lines">
        <colgroup>${widths.map((w) => `<col style="width:${w}%" />`).join('')}</colgroup>
        <thead>
          <tr>${headers
            .map(
              (header, index) =>
                `<th${index === headers.length - 1 ? ' class="num"' : ''}>${escapeHtml(header)}</th>`,
            )
            .join('')}</tr>
        </thead>
        <tbody>
          ${section.rows.map((row) => renderRow(model, row, labels)).join('\n')}
        </tbody>
      </table>
      <div class="subtotal">
        <span>${escapeHtml(labels.subtotalCollected)} — ${escapeHtml(labels.kinds[section.kind])}</span>
        <span><strong>${escapeHtml(formatMoney(collected.amount, model.currency))}</strong> (${collected.count})</span>
      </div>
    </section>`;
}

function renderRow(
  model: PaymentsReportModel,
  row: ReportRow,
  labels: PaymentsReportLabels,
): string {
  const dash = '<span class="muted">—</span>';
  const date = row.date
    ? `<div>${escapeHtml(formatInstantDay(row.date, labels))}</div><div class="sub">${escapeHtml(formatInstantTime(row.date, labels))}</div>`
    : `<div class="muted">${escapeHtml(labels.toConfirm)}</div>`;
  const installment = row.installment
    ? `<div class="sub">${escapeHtml(
        [
          labels.installmentOf(row.installment.rank, row.installment.total),
          row.installment.packName,
        ]
          .filter(Boolean)
          .join(' · '),
      )}</div>`
    : '';
  const status = row.status
    ? `<span class="status ${STATUS_TONE[row.status]}">${escapeHtml(labels.statuses[row.status])}</span>`
    : dash;
  const reference = [
    row.transactionRef
      ? `<div class="ref">${escapeHtml(row.transactionRef)}</div>`
      : '',
    row.receiptNumber
      ? `<div class="sub">${escapeHtml(`${labels.receipt} ${row.receiptNumber}`)}</div>`
      : '',
  ].join('');
  const cells: [string, string?][] = [
    [date],
    [`<div class="strong">${escapeHtml(row.orderCode)}</div>${installment}`],
    ...(model.showPractitioner
      ? [[row.practitioner ? escapeHtml(row.practitioner) : dash] as [string]]
      : []),
    [row.patient ? escapeHtml(row.patient) : dash],
    [row.method ? escapeHtml(labels.methods[row.method]) : dash, 'words'],
    [status, 'words'],
    [reference || dash],
    [
      row.amount ? escapeHtml(formatMoney(row.amount, model.currency)) : dash,
      'num amount',
    ],
  ];
  return `<tr>${cells
    .map(([cell, cls]) => `<td${cls ? ` class="${cls}"` : ''}>${cell}</td>`)
    .join('')}</tr>`;
}

// ─── Small helpers ──────────────────────────────────────────────────

function quote(text: string, lang: PaymentsReportModel['lang']): string {
  return lang === 'fr' ? `«${NBSP}${text}${NBSP}»` : `“${text}”`;
}

/** The Tunis calendar day of an instant, 'YYYY-MM-DD'. */
function businessDayOfInstant(instant: Date): string {
  const parts = dateFormatter('en-US', BUSINESS_TIME_ZONE, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function periodShort(
  period: ReportPeriod,
  labels: PaymentsReportLabels,
): string {
  const to = formatCalendarDayShort(period.to, labels);
  if (period.allDates || !period.from) return `${labels.allDates} – ${to}`;
  const from = formatCalendarDayShort(period.from, labels);
  return from === to ? from : `${from} – ${to}`;
}

/** The issuer on one line, for the running footer. */
function issuerLine(
  company: ReportCompany,
  brandName: string,
  labels: PaymentsReportLabels,
): string {
  const place = [company.address, company.city, company.country]
    .filter(Boolean)
    .join(', ');
  return [
    company.name ?? brandName,
    place,
    company.phone,
    company.email,
    company.taxNumber ? `${labels.taxNumber} ${company.taxNumber}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

// ─── Stylesheet ─────────────────────────────────────────────────────

const STYLES = `
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    margin: 0;
    color: ${INK};
    background: #ffffff;
    font-family: ${FONT_STACK};
    font-size: 9.4px;
    line-height: 1.42;
    font-variant-numeric: tabular-nums;
  }
  .document { width: 100%; }

  .masthead {
    position: relative;
    display: flex;
    justify-content: center;
    padding-bottom: 11px;
    margin-bottom: 14px;
    border-bottom: 1.5px solid ${INK};
  }
  .masthead::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: -2.5px;
    width: 64px;
    height: 3.5px;
    margin-left: -32px;
    border-radius: 2px;
    background: ${BRAND_YELLOW};
  }
  .logo { max-width: 176px; max-height: 64px; object-fit: contain; }
  .brand-word { font-size: 22px; font-weight: 800; letter-spacing: .18em; }

  .docrow {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 18px;
    align-items: start;
    break-inside: avoid;
  }
  .eyebrow { font-size: 8.5px; font-weight: 800; letter-spacing: .32em; color: #6b6f76; }
  .title {
    margin: 3px 0 0;
    font-size: 21px;
    line-height: 1.08;
    font-weight: 800;
    letter-spacing: .1em;
  }
  .kind {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    padding: 3px 10px 3px 8px;
    border-radius: 999px;
    background: ${INK};
    color: #ffffff;
    font-size: 8.6px;
    font-weight: 700;
    letter-spacing: .04em;
  }
  .kind-dot { width: 6px; height: 6px; border-radius: 50%; background: ${BRAND_YELLOW}; }

  .meta {
    margin: 0;
    min-width: 228px;
    max-width: 290px;
    border: 1px solid #e2e4e8;
    border-radius: 10px;
    padding: 7px 10px;
  }
  .meta-row { display: flex; justify-content: space-between; gap: 12px; padding: 2px 0; }
  .meta-row + .meta-row { border-top: 1px solid #f0f1f3; }
  .meta dt { color: #6b6f76; white-space: nowrap; }
  .meta dd { margin: 0; text-align: right; font-weight: 650; overflow-wrap: anywhere; }

  .section { margin-top: 14px; }
  .section.keep { break-inside: avoid; page-break-inside: avoid; }
  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    break-after: avoid;
    page-break-after: avoid;
  }
  .section-title {
    margin: 0 0 7px;
    font-size: 8.6px;
    font-weight: 800;
    letter-spacing: .14em;
    text-transform: uppercase;
    color: ${INK};
    break-after: avoid;
    page-break-after: avoid;
  }
  .section-title::before {
    content: '';
    display: inline-block;
    width: 7px;
    height: 7px;
    margin-right: 7px;
    border-radius: 2px;
    background: ${BRAND_YELLOW};
    vertical-align: 0;
  }
  .row-count { color: #6b6f76; font-size: 8.6px; white-space: nowrap; }

  .party-grid { display: grid; grid-template-columns: 1fr 1.15fr; gap: 10px; }
  .box {
    min-width: 0;
    border: 1px solid #e2e4e8;
    border-radius: 10px;
    padding: 9px 11px;
    break-inside: avoid;
  }
  .box-title {
    margin: 0 0 6px;
    color: #6b6f76;
    font-size: 8px;
    font-weight: 800;
    letter-spacing: .14em;
    text-transform: uppercase;
  }
  .box-line { margin: 1.5px 0; overflow-wrap: anywhere; }
  .box-line.strong { font-weight: 700; }

  table { width: 100%; border-collapse: separate; border-spacing: 0; }
  .criteria { table-layout: fixed; }
  .criteria th, .criteria td {
    padding: 2.5px 0;
    text-align: left;
    vertical-align: top;
    overflow-wrap: anywhere;
    border-bottom: 1px solid #f0f1f3;
  }
  .criteria tr:last-child th, .criteria tr:last-child td { border-bottom: 0; }
  .criteria tbody th { width: 34%; padding-right: 8px; color: #6b6f76; font-weight: 400; }
  .criteria td { font-weight: 600; }
  .criteria.two tbody th { width: 26%; }
  .criteria.two td { padding-right: 8px; }
  .criteria thead th {
    font-size: 7.6px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: ${INK};
    padding-bottom: 4px;
  }

  .summary, .lines {
    border: 1px solid ${INK};
    border-radius: 10px;
    overflow: hidden;
  }
  .summary { table-layout: fixed; }
  .summary th, .lines th {
    background: ${INK};
    color: #ffffff;
    padding: 7px 9px;
    font-size: 7.8px;
    font-weight: 800;
    letter-spacing: .1em;
    text-transform: uppercase;
    text-align: left;
    vertical-align: bottom;
  }
  .summary th.group { text-align: center; border-bottom: 1px solid #3a3a3a; }
  .summary td {
    padding: 6.5px 9px;
    border-top: 1px solid #ececec;
    font-size: 9.6px;
  }
  .summary tbody tr:first-child td { border-top: 0; }
  .summary.consolidated td, .summary.consolidated th { padding-left: 7px; padding-right: 7px; }
  .summary.consolidated td { font-size: 8.8px; }
  .num { text-align: right !important; }
  td.num { white-space: nowrap; }
  /* A status or a method breaks between its words, never inside one. */
  .lines td.words { overflow-wrap: normal; word-break: normal; }
  .summary tr.total td {
    background: ${INK};
    color: #ffffff;
    font-weight: 800;
    font-size: 10.4px;
    border-top: 0;
    padding-top: 8px;
    padding-bottom: 8px;
  }
  .summary tr.total td:first-child { box-shadow: inset 4px 0 0 ${BRAND_YELLOW}; letter-spacing: .06em; }
  .note { margin: 6px 0 0; color: #6b6f76; font-size: 8px; }
  .status-line { margin: 5px 0 0; color: #3c4043; font-size: 8.2px; }
  .status-chip { white-space: nowrap; margin-right: 6px; font-weight: 650; }

  .lines { table-layout: fixed; }
  .lines thead { display: table-header-group; }
  .lines tr { break-inside: avoid; page-break-inside: avoid; }
  .lines th { font-size: 7.2px; letter-spacing: .07em; padding: 6px 6px; }
  .lines td {
    padding: 5.5px 6px;
    border-top: 1px solid #ececec;
    vertical-align: top;
    font-size: 8.4px;
    line-height: 1.35;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .lines tbody tr:first-child td { border-top: 0; }
  .lines tbody tr:nth-child(even) td { background: #fafafa; }
  .lines td.amount { font-weight: 700; }
  .sub { margin-top: 1px; color: #6b6f76; font-size: 7.6px; }
  .strong { font-weight: 700; }
  .ref { font-size: 7.8px; }
  .muted { color: #8a8f96; }
  .status, .status-chip { display: inline-flex; align-items: center; gap: 4px; }
  .status::before, .status-chip::before {
    content: '';
    flex: none;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
  }
  .ok { color: #15803d; }
  .wait { color: #b45309; }
  .ko { color: #b91c1c; }
  .status { font-weight: 650; }

  .subtotal {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: 6px;
    padding: 6px 10px;
    border: 1px solid #e2e4e8;
    border-left: 3px solid ${BRAND_YELLOW};
    border-radius: 8px;
    font-size: 9px;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .empty {
    padding: 18px 12px;
    border: 1px dashed #c9ccd1;
    border-radius: 10px;
    color: #4b5057;
    text-align: center;
    font-size: 9.6px;
  }
  .closing {
    margin-top: 16px;
    padding-top: 8px;
    border-top: 1px solid #e2e4e8;
    color: #8a8f96;
    font-size: 7.8px;
    text-align: center;
    break-inside: avoid;
  }
`;
