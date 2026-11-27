// Dashboards (admin + doctor)
// Split out of the former 2,000-line lib/types/index.ts; import via '@/lib/types'.

import type { Localized } from './blog';

// ==========================================
// DASHBOARD (Admin + Doctor)
// ==========================================

export interface DashboardRange {
  from?: string;
  to?: string;
}

export interface AdminDashboardKpis {
  range: { from: string; to: string };
  revenue: {
    total: number;
    today: number;
    thisMonth: number;
    prevMonth: number;
    monthlyGrowthPct: number;
    collected: number;
    unpaid: number;
  };
  doctors: { total: number; active: number; inactive: number; newInRange: number };
  patients: { total: number; newInRange: number };
  orders: {
    total: number;
    inRange: number;
    today: number;
    thisMonth: number;
    paid: number;
    unpaid: number;
  };
  payments: {
    pending: number;
    awaitingConfirmation: number;
    completed: number;
    failed: number;
    rejected: number;
  };
  packs: {
    active: number;
    bestSelling: { id: string; name: string; soldCount: number; revenue: number } | null;
    conversionRatePct: number;
    averageOrderValue: number;
  };
}

export interface AdminTopDoctorRow {
  doctorId: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  clinicName: string | null;
  city: string | null;
  orders: number;
  paidOrders: number;
  revenue: number;
  outstanding: number;
}

export interface AdminTopDoctorsResponse {
  byOrders: AdminTopDoctorRow[];
  byPaidOrders: AdminTopDoctorRow[];
  byOutstanding: AdminTopDoctorRow[];
}

export interface AdminBestPackRow {
  packId: string;
  name: string;
  isActive: boolean;
  sold: number;
  revenue: number;
  collected: number;
  currentPrice: number;
  currency: string;
}

export interface AdminTrendPoint {
  date: string;
  revenue: number;
  orders: number;
  newDoctors: number;
  newPatients: number;
}

export interface AdminTrendsResponse {
  range: { from: string; to: string };
  points: AdminTrendPoint[];
}

export interface DoctorDashboardKpis {
  doctorId: string;
  generatedAt: string;
  orders: {
    total: number;
    today: number;
    thisMonth: number;
    prevMonth: number;
    /** Submitted / under-review orders waiting for clinical review. */
    submitted?: number;
    /** Finished orders. */
    completed?: number;
    /** Orders currently in treatment-planning workflow. */
    inTreatment?: number;
    /** Orders currently in quotation / payment workflow. */
    inPayment?: number;
    /** Orders whose active quotation is paid in full. */
    paid: number;
    /** Orders whose active quotation is pending / partially paid. */
    unpaid: number;
    /**
     * Orders that don't yet have an active (non-deleted) quotation.
     * Optional for backward-compat — older backend builds don't
     * return this field. Falls back to undefined and the UI uses
     * `total - paid - unpaid` as a derived value where it matters.
     */
    noActiveQuote?: number;
  };
  patients: { total: number; newThisMonth: number };
  revenue: { totalGenerated: number; collected: number; unpaidDebt: number };
  payments: {
    pending: number;
    completed: number;
    failed: number;
    awaitingConfirmation: number;
  };
  quotations: { total: number; paid: number; unpaid: number };
  currentPack: {
    id: string;
    name: string;
    description: string | null;
    approvedAt: string | null;
    expiresAt: string | null;
    remainingDays: number | null;
    usagePct: number | null;
    totalCredits?: number | null;
    usedCredits?: number | null;
    remainingCredits?: number | null;
    isUnlimitedSteps: boolean;
  } | null;
  suggestedPack: {
    id: string;
    name: string;
    description: string | null;
    isActive: boolean;
  } | null;
}

/**
 * One pack of the practitioner catalogue (GET doctor/dashboard/available-packs).
 * Read-only: the pack of a case is the one attached to its quote.
 */
export interface AvailablePack {
  id: string;
  /** French / legacy plain columns; the `*I18n` bags win when set. */
  name: string;
  description: string | null;
  nameI18n?: Partial<Localized<string>> | null;
  descriptionI18n?: Partial<Localized<string>> | null;
  /** Display text of the validity ("2 ans"). Never parsed. */
  treatmentExpirationLabel?: Partial<Localized<string>> | null;
  finishingIncludedLabel?: Partial<Localized<string>> | null;
  /** Coverage window in months: the validity shown when no label is set. */
  treatmentValidityMonths?: number | null;
  maxStepsPerArch: number | null;
  includedCorrections: number | null;
  isUnlimitedSteps: boolean;
  isUnlimitedCorrections: boolean;
  /** Retired flag, always false on current packs: not displayed. */
  isForOrthodontists: boolean;
  /** TTC; null when the pack does not offer this arch. */
  priceTwoArches: number | null;
  priceSingleArch: number | null;
  currency: string;
  /** The pack of the doctor's latest paid quote. */
  isCurrent: boolean;
}
