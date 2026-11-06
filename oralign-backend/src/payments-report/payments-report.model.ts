import type {
  PaymentMethod,
  PaymentRecordStatus,
  Prisma,
} from '@prisma/client';
import type { DocumentLogo } from '../common/pdf/document-logo';
import type { MethodTallies } from '../payments/services/payments-summary.service';
import type {
  PaymentsReportKind,
  PaymentsReportLanguage,
} from './dto/payments-report.dto';
import type { ReportSectionKind } from './payments-report.i18n';

/**
 * Everything a payments report prints, resolved by PaymentsReportService
 * and laid out by the template. Plain data: the template does no I/O.
 */
export interface PaymentsReportModel {
  lang: PaymentsReportLanguage;
  kind: PaymentsReportKind;
  period: ReportPeriod;
  generatedAt: Date;
  /** Who asked for the report (audit trail of an archived copy). */
  generatedBy: string | null;
  /** A dentist's report covers their own orders only: no practitioner column. */
  showPractitioner: boolean;
  /** The brand over the title, from the billing settings. */
  brandName: string;
  company: ReportCompany;
  logo: DocumentLogo | null;
  /** One section per kind, in the desk's tab order (fees, then installments). */
  sections: ReportSection[];
  currency: string;
}

/** Business days ('YYYY-MM-DD', Africa/Tunis), both included. */
export interface ReportPeriod {
  /** null: no start (every date up to `to`). */
  from: string | null;
  to: string;
  /** "Toutes les dates": the rows carry no date filter at all. */
  allDates: boolean;
}

/** The issuer block: only what the billing settings hold, nothing invented. */
export interface ReportCompany {
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
  website: string | null;
}

/** The filters a section was built with, as the reader should see them. */
export interface ReportCriteria {
  /** The practitioner's name; null: every practitioner. */
  practitioner: string | null;
  /** Empty: every method. */
  methods: PaymentMethod[];
  /** Empty: every status. */
  statuses: PaymentRecordStatus[];
  search: string | null;
  /** Installment sections only; null bounds are open. */
  installment: { min: number | null; max: number | null } | null;
}

export interface ReportRow {
  /** When the payment happened (Tunis time is applied when printed); null: a fee still to confirm. */
  date: Date | null;
  orderCode: string;
  practitioner: string | null;
  patient: string | null;
  method: PaymentMethod | null;
  status: PaymentRecordStatus | null;
  /** Exact amount; null when no fee was set. */
  amount: Prisma.Decimal | null;
  /** Gateway id, bank reference, cash receipt or our ORA- reference. */
  transactionRef: string | null;
  /** The printed receipt (FAC-…, TF-…). */
  receiptNumber: string | null;
  installment: {
    rank: number;
    /** How many installments the quote has; null when unknown. */
    total: number | null;
    packName: string | null;
  } | null;
}

export interface ReportSection {
  kind: ReportSectionKind;
  criteria: ReportCriteria;
  rows: ReportRow[];
  /** Successful payments only, summed by the same queries as the desk's figures. */
  collected: MethodTallies;
}
