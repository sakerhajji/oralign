import { Prisma } from '@prisma/client';
import type { DocumentLogo } from '../../common/pdf/document-logo';
import { BUSINESS_TIME_ZONE } from '../../common/time/business-day';
import type { AccountingSummary } from './invoice-accounting.service';
import {
  accountingLabels,
  type AccountingLabels,
  type AccountingLanguage,
} from './invoice-accounting.i18n';
import { businessDayOf } from './invoice-period';

export type { AccountingLanguage } from './invoice-accounting.i18n';

/**
 * The "Récapitulatif comptable" as one self-contained A4 portrait HTML
 * document, printed by PdfRendererService. Same family as the payments
 * report: the logo alone at the top over an ink-black rule, uppercase
 * spaced titles, black table headers, hairline grey boxes, the brand
 * yellow of the ORALIGN logo as the only accent.
 *
 * Pure functions: no I/O, every value escaped, amounts printed from their
 * exact digits (never re-rounded through a float).
 */

/** Everything the PDF prints, resolved by InvoiceAccountingService. */
export interface AccountingReportModel {
  lang: AccountingLanguage;
  summary: AccountingSummary;
  generatedAt: Date;
  generatedBy: string | null;
  brandName: string;
  company: AccountingCompany;
  logo: DocumentLogo | null;
  currency: string;
}

/** The issuer block: only what the billing settings hold, nothing invented. */
export interface AccountingCompany {
  name: string | null;
  tradeName: string | null;
  legalForm: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  taxNumber: string | null;
  tradeRegister: string | null;
}

const NBSP = String.fromCharCode(0xa0);
const INK = '#111111';
const BRAND_YELLOW = '#FECA16';
const FONT_STACK = 'Inter, Roboto, Arial, "DejaVu Sans", sans-serif';

/** Page margins: the running footer prints inside the bottom one. */
export const ACCOUNTING_PAGE_MARGIN = {
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

/** "1 234,500": 3 decimals, no-break thousands spaces, decimal comma (both languages). */
export function formatAmount(value: number): string {
  const amount = new Prisma.Decimal(Number.isFinite(value) ? value : 0);
  const [whole, millimes] = amount.abs().toFixed(3).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const negative = amount.isNegative() && !amount.isZero();
  return `${negative ? '−' : ''}${grouped},${millimes}`;
}

export function formatMoney(value: number, currency: string): string {
  return `${formatAmount(value)}${NBSP}${currency}`;
}

/** "19 %", "7 %", "13,5 %". */
export function formatRate(rate: number, labels: AccountingLabels): string {
  const text = new Prisma.Decimal(rate).toDecimalPlaces(3).toString();
  const shown = labels.locale.startsWith('fr') ? text.replace('.', ',') : text;
  return `${shown}${NBSP}%`;
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

/** A business day 'YYYY-MM-DD' as "01/11/2026". */
export function formatDay(day: string, labels: AccountingLabels): string {
  const [year, month, date] = day.split('-').map(Number);
  return dateFormatter(labels.locale, 'UTC', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, date)));
}

/** A Tunis month 'YYYY-MM' as "Novembre 2026" / "November 2026". */
export function formatMonth(month: string, labels: AccountingLabels): string {
  const [year, index] = month.split('-').map(Number);
  const text = dateFormatter(labels.locale, 'UTC', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, index - 1, 1)));
  return text.charAt(0).toLocaleUpperCase(labels.locale) + text.slice(1);
}

/** "du 01/11/2026 au 30/11/2026", "Toute la période"… */
export function formatPeriod(
  period: AccountingSummary['period'],
  labels: AccountingLabels,
): string {
  const from = period.from ? formatDay(period.from, labels) : null;
  const to = period.to ? formatDay(period.to, labels) : null;
  if (from && to) {
    return from === to ? labels.periodOn(from) : labels.periodBetween(from, to);
  }
  if (from) return labels.periodSince(from);
  if (to) return labels.periodUntil(to);
  return labels.allPeriod;
}

function formatGeneratedAt(instant: Date, labels: AccountingLabels): string {
  const day = formatDay(businessDayOf(instant), labels);
  const time = dateFormatter(labels.locale, BUSINESS_TIME_ZONE, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant);
  return labels.generatedAt(day, time);
}

/** "recap-comptable-2026-11-01_2026-11-30.pdf" — ASCII only. */
export function accountingReportFileName(model: AccountingReportModel): string {
  const { from, to } = model.summary.period;
  if (!from && !to) return 'recap-comptable-toute-la-periode.pdf';
  const start = from ?? 'origine';
  const end = to ?? businessDayOf(model.generatedAt);
  return `recap-comptable-${start}_${end}.pdf`;
}

// ─── Document ───────────────────────────────────────────────────────

export function renderAccountingReportHtml(model: AccountingReportModel): string {
  const labels = accountingLabels(model.lang);
  const brand = model.brandName.toUpperCase();
  const s = model.summary;
  const showMonths = s.byMonth.length >= 2;
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
          <h1 class="title">${escapeHtml(labels.documentTitle.toUpperCase())}</h1>
          <div class="kind"><span class="kind-dot"></span>${escapeHtml(formatPeriod(s.period, labels))}</div>
        </div>
        ${renderMeta(model, labels)}
      </section>

      <section class="section keep party-grid">
        ${renderIssuer(model, labels)}
        ${renderScope(model, labels)}
      </section>

      ${renderKpis(model, labels)}
      ${renderVat(model, labels)}
      ${renderWithholding(model, labels)}
      ${renderMethods(model, labels)}
      ${showMonths ? renderMonths(model, labels) : ''}
      ${renderNotes(model, labels)}

      <footer class="closing">
        <div>${escapeHtml(labels.endOfReport)}</div>
        <div>${escapeHtml(labels.automaticNotice)}</div>
      </footer>
    </main>
  </body>
</html>`;
}

/**
 * The running footer Chromium prints on every page: the issuer, then the
 * document and its period on the left, "Page X / Y" on the right. Inline
 * styles only: the document's stylesheet does not reach the margins.
 */
export function renderAccountingReportFooter(model: AccountingReportModel): string {
  const labels = accountingLabels(model.lang);
  const c = model.company;
  const issuer = [
    c.name ?? model.brandName,
    [c.address, c.city, c.country].filter(Boolean).join(', '),
    c.taxNumber ? `${labels.taxNumber} ${c.taxNumber}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const title = `${labels.documentTitle} · ${formatPeriod(model.summary.period, labels)}`;
  return `<div style="width:100%;box-sizing:border-box;padding:0 11mm;font-family:${FONT_STACK.replace(/"/g, "'")};font-size:6.8px;line-height:1.4;color:#5f6368;-webkit-print-color-adjust:exact;">
  <div style="border-top:0.6px solid #d6d8dc;padding-top:3px;overflow-wrap:anywhere;">${escapeHtml(issuer)}</div>
  <div style="display:flex;justify-content:space-between;gap:12px;margin-top:1px;">
    <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(title)}</span>
    <span style="flex:none;white-space:nowrap;color:#111111;font-weight:600;">${escapeHtml(labels.page)} <span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>
</div>`;
}

// ─── Header blocks ──────────────────────────────────────────────────

function renderMeta(model: AccountingReportModel, labels: AccountingLabels): string {
  const rows: [string, string][] = [
    [labels.period, formatPeriod(model.summary.period, labels)],
    [labels.generatedOn, formatGeneratedAt(model.generatedAt, labels)],
  ];
  if (model.generatedBy) rows.push([labels.generatedBy, model.generatedBy]);
  rows.push([labels.timeZone, labels.timeZoneValue]);
  rows.push([labels.currency, model.currency]);
  return `<dl class="meta">${rows
    .map(
      ([label, value]) =>
        `<div class="meta-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`,
    )
    .join('')}</dl>`;
}

function renderIssuer(model: AccountingReportModel, labels: AccountingLabels): string {
  const c = model.company;
  const name = c.name ?? model.brandName;
  const identity = [c.tradeName, c.legalForm]
    .filter((part): part is string => Boolean(part) && part !== name)
    .join(' · ');
  const lines: { text: string; strong?: boolean }[] = [
    { text: name, strong: true },
    { text: identity },
    { text: c.taxNumber ? labels.labelled(labels.taxNumber, c.taxNumber) : '', strong: true },
    { text: c.tradeRegister ? labels.labelled(labels.tradeRegister, c.tradeRegister) : '' },
    { text: c.address ?? '' },
    { text: [c.city, c.country].filter(Boolean).join(', ') },
    { text: [c.phone, c.email].filter(Boolean).join(' · ') },
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

function renderScope(model: AccountingReportModel, labels: AccountingLabels): string {
  const s = model.summary;
  const rows: [string, string, string?][] = [
    [
      labels.countedInvoices,
      String(s.counted.count),
      labels.countedSplit(s.unpaid.count, s.paid.count),
    ],
    [
      labels.excluded,
      labels.excludedValue(s.drafts.count, s.cancelled.count),
      labels.excludedAmounts(
        formatMoney(s.drafts.totalTtc, model.currency),
        formatMoney(s.cancelled.totalTtc, model.currency),
      ),
    ],
    [labels.rule, labels.ruleValue],
  ];
  return `<article class="box">
          <h2 class="box-title">${escapeHtml(labels.scope)}</h2>
          <table class="criteria"><tbody>${rows
            .map(
              ([label, value, sub]) =>
                `<tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(value)}${
                  sub ? `<div class="sub">${escapeHtml(sub)}</div>` : ''
                }</td></tr>`,
            )
            .join('')}</tbody></table>
        </article>`;
}

// ─── Key figures ────────────────────────────────────────────────────

function renderKpis(model: AccountingReportModel, labels: AccountingLabels): string {
  const s = model.summary;
  const money = (value: number) => escapeHtml(formatMoney(value, model.currency));
  const tiles: { label: string; value: string; sub: string; tone?: string }[] = [
    {
      label: labels.revenueHt,
      value: money(s.counted.subTotalHt),
      sub: escapeHtml(labels.revenueHtSub(s.counted.count)),
    },
    {
      label: labels.vatCollected,
      value: money(s.counted.tvaAmount),
      sub: escapeHtml(labels.vatCollectedSub),
      tone: 'accent',
    },
    {
      label: labels.stampDuty,
      value: money(s.counted.stampDuty),
      sub: escapeHtml(labels.stampDutySub(s.counted.stampCount)),
    },
    {
      label: labels.totalTtc,
      value: money(s.counted.totalTtc),
      sub: escapeHtml(labels.totalTtcSub),
      tone: 'ink',
    },
    {
      label: labels.withholding,
      value: money(s.counted.withholdingAmount),
      sub: escapeHtml(labels.withholdingSub(s.withholdingByDoctor.length)),
    },
    {
      label: labels.collected,
      value: money(s.paid.netPayable),
      sub: escapeHtml(
        labels.toCollect(formatMoney(s.unpaid.netPayable, model.currency), s.unpaid.count),
      ),
    },
  ];
  const check = labels.labelled(
    labels.check,
    `${formatAmount(s.counted.subTotalHt)} + ${formatAmount(s.counted.tvaAmount)} + ${formatAmount(
      s.counted.stampDuty,
    )} = ${formatAmount(s.counted.totalTtc)} (${labels.checkHtTvaStamp}) · ${formatAmount(
      s.counted.totalTtc,
    )} − ${formatAmount(s.counted.withholdingAmount)} = ${formatAmount(s.counted.netPayable)} (${
      labels.checkNet
    })`,
  );
  return `<section class="section keep">
      <h2 class="section-title">${escapeHtml(labels.keyFigures)}</h2>
      <div class="kpis">${tiles
        .map(
          (tile) => `<div class="kpi${tile.tone ? ` ${tile.tone}` : ''}">
          <div class="kpi-label">${escapeHtml(tile.label)}</div>
          <div class="kpi-value">${tile.value}</div>
          <div class="kpi-sub">${tile.sub}</div>
        </div>`,
        )
        .join('')}</div>
      <p class="note check">${escapeHtml(check)}</p>
    </section>`;
}

// ─── TVA ────────────────────────────────────────────────────────────

function renderVat(model: AccountingReportModel, labels: AccountingLabels): string {
  const s = model.summary;
  const head = sectionHead(labels.vatTitle, `${labels.vatHint} · ${labels.amountsIn(model.currency)}`);
  if (s.counted.count === 0) {
    return `<section class="section keep">${head}<div class="empty">${escapeHtml(labels.empty)}</div></section>`;
  }
  const rows = s.byRate
    .map(
      (r) => `<tr>
          <td class="strong">${escapeHtml(formatRate(r.rate, labels))}${
            r.rate === 0 ? ` <span class="muted">(${escapeHtml(labels.rateExempt)})</span>` : ''
          }</td>
          <td class="num">${r.count}</td>
          <td class="num">${escapeHtml(formatAmount(r.baseHt))}</td>
          <td class="num strong">${escapeHtml(formatAmount(r.tvaAmount))}</td>
        </tr>`,
    )
    .join('');
  const exemptBase = s.byRate
    .filter((r) => r.rate === 0)
    .reduce((acc, r) => acc.plus(r.baseHt), new Prisma.Decimal(0));
  const taxableBase = new Prisma.Decimal(s.counted.subTotalHt).minus(exemptBase);
  const decl: [string, number][] = [
    [labels.declTaxableBase, Number(taxableBase.toFixed(3))],
    ...(exemptBase.isZero()
      ? []
      : ([[labels.declExemptBase, Number(exemptBase.toFixed(3))]] as [string, number][])),
    [labels.declVat, s.counted.tvaAmount],
    [labels.declStamp(s.counted.stampCount), s.counted.stampDuty],
  ];
  return `<section class="section keep">
      ${head}
      <div class="vat-grid">
        <table class="summary">
          <colgroup><col style="width:28%" /><col style="width:14%" /><col style="width:29%" /><col style="width:29%" /></colgroup>
          <thead><tr>
            <th>${escapeHtml(labels.rate)}</th>
            <th class="num">${escapeHtml(labels.invoicesShort)}</th>
            <th class="num">${escapeHtml(labels.baseHt)}</th>
            <th class="num">${escapeHtml(labels.vatAmount)}</th>
          </tr></thead>
          <tbody>
            ${rows}
            <tr class="total">
              <td>${escapeHtml(labels.totalVat.toUpperCase())}</td>
              <td class="num">${s.counted.count}</td>
              <td class="num">${escapeHtml(formatAmount(s.counted.subTotalHt))}</td>
              <td class="num">${escapeHtml(formatAmount(s.counted.tvaAmount))}</td>
            </tr>
          </tbody>
        </table>
        <aside class="box decl">
          <h3 class="box-title">${escapeHtml(labels.declarationTitle)}</h3>
          <dl>${decl
            .map(
              ([label, value]) =>
                `<div class="decl-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(formatAmount(value))}</dd></div>`,
            )
            .join('')}</dl>
          <p class="decl-note">${escapeHtml(labels.declNote)}</p>
        </aside>
      </div>
    </section>`;
}

// ─── Retenues à la source ───────────────────────────────────────────

function renderWithholding(model: AccountingReportModel, labels: AccountingLabels): string {
  const s = model.summary;
  const head = sectionHead(labels.withholdingTitle, labels.amountsIn(model.currency));
  if (s.withholdingByDoctor.length === 0) {
    return `<section class="section keep">${head}<div class="empty">${escapeHtml(labels.noWithholding)}</div></section>`;
  }
  const dash = '<span class="muted">—</span>';
  const base = s.withholdingByDoctor.reduce(
    (acc, r) => acc.plus(r.baseTtc),
    new Prisma.Decimal(0),
  );
  const count = s.withholdingByDoctor.reduce((acc, r) => acc + r.count, 0);
  return `<section class="section">
      ${head}
      <table class="lines">
        <colgroup><col style="width:29%" /><col style="width:19%" /><col style="width:7%" /><col style="width:18%" /><col style="width:15%" /><col style="width:12%" /></colgroup>
        <thead><tr>
          <th>${escapeHtml(labels.practitioner)}</th>
          <th>${escapeHtml(labels.practitionerTaxId)}</th>
          <th class="num">${escapeHtml(labels.invoicesShort)}</th>
          <th class="num">${escapeHtml(labels.baseTtc)}</th>
          <th class="num">${escapeHtml(labels.withheld)}</th>
          <th class="center">${escapeHtml(labels.certificate)}</th>
        </tr></thead>
        <tbody>
          ${s.withholdingByDoctor
            .map(
              (r) => `<tr>
            <td class="strong">${escapeHtml(r.name)}</td>
            <td>${r.taxId ? escapeHtml(r.taxId) : dash}</td>
            <td class="num">${r.count}</td>
            <td class="num">${escapeHtml(formatAmount(r.baseTtc))}</td>
            <td class="num strong">${escapeHtml(formatAmount(r.withholdingAmount))}</td>
            <td class="center"><span class="tick"></span><span class="sub">${escapeHtml(labels.certificateBox)}</span></td>
          </tr>`,
            )
            .join('\n')}
        </tbody>
        <tfoot><tr class="total">
          <td colspan="2">${escapeHtml(labels.totalWithholding.toUpperCase())}</td>
          <td class="num">${count}</td>
          <td class="num">${escapeHtml(formatAmount(Number(base.toFixed(3))))}</td>
          <td class="num">${escapeHtml(formatAmount(s.counted.withholdingAmount))}</td>
          <td></td>
        </tr></tfoot>
      </table>
      <p class="note callout">${escapeHtml(labels.withholdingNote)}</p>
    </section>`;
}

// ─── Encaissements ──────────────────────────────────────────────────

function renderMethods(model: AccountingReportModel, labels: AccountingLabels): string {
  const s = model.summary;
  const head = sectionHead(labels.methodsTitle, labels.amountsIn(model.currency));
  const remaining = `<p class="note">${escapeHtml(
    labels.remaining(s.unpaid.count, formatMoney(s.unpaid.netPayable, model.currency)),
  )}</p>`;
  if (s.byMethod.length === 0) {
    return `<section class="section keep">${head}<div class="empty">${escapeHtml(labels.noPaid)}</div>${remaining}</section>`;
  }
  return `<section class="section keep">
      ${head}
      <table class="summary">
        <colgroup><col style="width:52%" /><col style="width:16%" /><col style="width:32%" /></colgroup>
        <thead><tr>
          <th>${escapeHtml(labels.method)}</th>
          <th class="num">${escapeHtml(labels.invoices)}</th>
          <th class="num">${escapeHtml(labels.netCollected)}</th>
        </tr></thead>
        <tbody>
          ${s.byMethod
            .map(
              (m) => `<tr>
            <td>${escapeHtml(m.method ? labels.methods[m.method] : labels.methodUnknown)}</td>
            <td class="num">${m.count}</td>
            <td class="num">${escapeHtml(formatAmount(m.netPayable))}</td>
          </tr>`,
            )
            .join('')}
          <tr class="total">
            <td>${escapeHtml(labels.totalCollected.toUpperCase())}</td>
            <td class="num">${s.paid.count}</td>
            <td class="num">${escapeHtml(formatAmount(s.paid.netPayable))}</td>
          </tr>
        </tbody>
      </table>
      <p class="note">${escapeHtml(labels.methodsNote)}</p>
      ${remaining}
    </section>`;
}

// ─── Months ─────────────────────────────────────────────────────────

function renderMonths(model: AccountingReportModel, labels: AccountingLabels): string {
  const s = model.summary;
  const head = sectionHead(labels.monthsTitle, labels.amountsIn(model.currency));
  const amounts = (r: {
    subTotalHt: number;
    tvaAmount: number;
    stampDuty: number;
    totalTtc: number;
    withholdingAmount: number;
    netPayable: number;
  }) =>
    [r.subTotalHt, r.tvaAmount, r.stampDuty, r.totalTtc, r.withholdingAmount, r.netPayable]
      .map((v) => `<td class="num">${escapeHtml(formatAmount(v))}</td>`)
      .join('');
  return `<section class="section">
      ${head}
      <table class="lines months">
        <colgroup><col style="width:15%" /><col style="width:6%" />${'<col style="width:13.1667%" />'.repeat(6)}</colgroup>
        <thead><tr>
          <th>${escapeHtml(labels.month)}</th>
          <th class="num">${escapeHtml(labels.invoicesShort)}</th>
          <th class="num">${escapeHtml(labels.ht)}</th>
          <th class="num">${escapeHtml(labels.tva)}</th>
          <th class="num">${escapeHtml(labels.stamp)}</th>
          <th class="num">${escapeHtml(labels.ttc)}</th>
          <th class="num">${escapeHtml(labels.retenue)}</th>
          <th class="num">${escapeHtml(labels.net)}</th>
        </tr></thead>
        <tbody>
          ${s.byMonth
            .map(
              (m) => `<tr>
            <td class="strong">${escapeHtml(formatMonth(m.month, labels))}</td>
            <td class="num">${m.count}</td>
            ${amounts(m)}
          </tr>`,
            )
            .join('\n')}
        </tbody>
        <tfoot><tr class="total">
          <td>${escapeHtml(labels.total.toUpperCase())}</td>
          <td class="num">${s.counted.count}</td>
          ${amounts(s.counted)}
        </tr></tfoot>
      </table>
    </section>`;
}

// ─── Notes ──────────────────────────────────────────────────────────

function renderNotes(model: AccountingReportModel, labels: AccountingLabels): string {
  const s = model.summary;
  const money = (value: number) => formatMoney(value, model.currency);
  const mixed = s.byRate.length > 1;
  const notes = [
    labels.noteCounting,
    labels.noteExcluded(
      s.drafts.count,
      money(s.drafts.totalTtc),
      s.cancelled.count,
      money(s.cancelled.totalTtc),
    ),
    labels.noteAmounts,
    ...(mixed ? [labels.noteMixed] : []),
    ...(s.counted.discountAmount > 0 ? [labels.noteDiscount(money(s.counted.discountAmount))] : []),
    labels.noteJournal,
  ];
  return `<section class="section keep notes">
      <h2 class="section-title">${escapeHtml(labels.notesTitle)}</h2>
      <ol class="notes-list">${notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ol>
    </section>`;
}

function sectionHead(title: string, aside: string): string {
  return `<div class="section-head">
        <h2 class="section-title">${escapeHtml(title)}</h2>
        <span class="row-count">${escapeHtml(aside)}</span>
      </div>`;
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
  .row-count { color: #6b6f76; font-size: 8px; white-space: nowrap; }

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
    padding: 3px 0;
    text-align: left;
    vertical-align: top;
    overflow-wrap: anywhere;
    border-bottom: 1px solid #f0f1f3;
  }
  .criteria tr:last-child th, .criteria tr:last-child td { border-bottom: 0; }
  .criteria tbody th { width: 38%; padding-right: 8px; color: #6b6f76; font-weight: 400; }
  .criteria td { font-weight: 650; }
  .criteria td .sub { font-weight: 400; }

  .kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .kpi {
    min-width: 0;
    border: 1px solid #e2e4e8;
    border-radius: 10px;
    padding: 8px 10px 9px;
    break-inside: avoid;
  }
  .kpi.accent { border-color: ${INK}; box-shadow: inset 3px 0 0 ${BRAND_YELLOW}; }
  .kpi.ink { background: ${INK}; border-color: ${INK}; color: #ffffff; }
  .kpi-label {
    font-size: 7.6px;
    font-weight: 800;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: #6b6f76;
  }
  .kpi.ink .kpi-label, .kpi.ink .kpi-sub { color: #c9ccd1; }
  .kpi-value { margin-top: 3px; font-size: 14.5px; font-weight: 800; white-space: nowrap; letter-spacing: -.01em; }
  .kpi-sub { margin-top: 2px; font-size: 7.8px; color: #6b6f76; overflow-wrap: anywhere; }
  .note.check { font-size: 7.6px; }

  .vat-grid { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); gap: 10px; align-items: start; }
  .decl dl { margin: 0; }
  .decl-row { display: flex; justify-content: space-between; gap: 10px; padding: 3px 0; }
  .decl-row + .decl-row { border-top: 1px solid #f0f1f3; }
  .decl dt { color: #3c4043; min-width: 0; }
  .decl dd { margin: 0; font-weight: 750; white-space: nowrap; }
  .decl-note { margin: 6px 0 0; color: #6b6f76; font-size: 7.6px; }

  .summary, .lines {
    border: 1px solid ${INK};
    border-radius: 10px;
    overflow: hidden;
    table-layout: fixed;
  }
  .summary th, .lines th {
    background: ${INK};
    color: #ffffff;
    padding: 7px 8px;
    font-size: 7.6px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
    text-align: left;
    vertical-align: bottom;
  }
  .summary td {
    padding: 6px 8px;
    border-top: 1px solid #ececec;
    font-size: 9.2px;
  }
  .summary tbody tr:first-child td { border-top: 0; }
  .num { text-align: right !important; }
  .center { text-align: center !important; }
  td.num { white-space: nowrap; }
  .summary tr.total td, .lines tr.total td {
    background: ${INK};
    color: #ffffff;
    font-weight: 800;
    font-size: 9.4px;
    border-top: 0;
    padding-top: 7px;
    padding-bottom: 7px;
  }
  /* The yellow tab of a total row: a hard-edged gradient, not an inset
     shadow (Chromium prints a shadow's anti-aliased edge as a hairline). */
  .summary tr.total td:first-child, .lines tr.total td:first-child {
    background: linear-gradient(90deg, ${BRAND_YELLOW} 0, ${BRAND_YELLOW} 4px, ${INK} 4px);
    letter-spacing: .06em;
    padding-left: 11px;
  }
  .note { margin: 6px 0 0; color: #6b6f76; font-size: 8px; }
  .note.callout {
    padding: 6px 10px;
    border: 1px solid #e2e4e8;
    border-left: 3px solid ${BRAND_YELLOW};
    border-radius: 8px;
    color: #3c4043;
    break-inside: avoid;
  }

  .lines thead { display: table-header-group; }
  .lines tfoot { display: table-row-group; }
  .lines tr { break-inside: avoid; page-break-inside: avoid; }
  .lines th { font-size: 7.1px; letter-spacing: .06em; padding: 6px 6px; }
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
  .lines.months td { font-size: 8.1px; padding-left: 5px; padding-right: 5px; }
  .lines.months th { padding-left: 5px; padding-right: 5px; }
  .tick {
    display: inline-block;
    width: 8px;
    height: 8px;
    margin-right: 4px;
    border: 1px solid #6b6f76;
    border-radius: 2px;
    vertical-align: -1px;
  }
  .lines td .sub { display: inline; }
  .sub { margin-top: 1px; color: #6b6f76; font-size: 7.6px; }
  .strong { font-weight: 700; }
  .muted { color: #8a8f96; font-weight: 400; }

  .empty {
    padding: 14px 12px;
    border: 1px dashed #c9ccd1;
    border-radius: 10px;
    color: #4b5057;
    text-align: center;
    font-size: 9.2px;
  }
  .notes-list { margin: 0; padding-left: 16px; color: #3c4043; font-size: 8px; }
  .notes-list li { margin: 2px 0; }
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
