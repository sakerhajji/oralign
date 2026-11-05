import apiClient from './client';
import { extractApiError } from './error';

/**
 * errorCode the fee endpoints (cash / bank transfer / proof upload /
 * ClicToPay session) answer with when the order's fees were waived by
 * the welcome gift — there is nothing to pay.
 */
export const WELCOME_GIFT_NOTHING_DUE = 'WELCOME_GIFT_NOTHING_DUE';

export function isWelcomeGiftNothingDue(error: unknown): boolean {
  return extractApiError(error).errorCode === WELCOME_GIFT_NOTHING_DUE;
}

/**
 * Welcome gift (once per practitioner) — the dentist-only status read
 * behind the dashboard banner and the wizard's review note.
 *
 * Every amount is live from the active billing settings (the backend
 * never hardcodes a price): `treatmentFee` is the configured default
 * treatment fee, `cbctFee` the CBCT supplement when it is enabled and
 * priced (0 otherwise). Plain JS numbers — Decimals are converted
 * server-side, like the other money fields.
 *
 * `eligible` is the BANNER rule: the switch is on, the doctor has not
 * used the gift yet and it is worth > 0 (past cases and drafts don't
 * matter). The gift itself is decided again, atomically, at submit
 * time — the order response then carries `welcomeGift` with the
 * snapshotted amounts.
 */
export interface WelcomeGiftStatus {
  enabled: boolean;
  eligible: boolean;
  /**
   * True while the doctor has never submitted a case — the gift would
   * land on their FIRST case (drives the "premier" vs "prochain" copy).
   */
  firstCase: boolean;
  currency: string;
  treatmentFee: number;
  cbctFee: number;
  cbctOffered: boolean;
  /** treatmentFee + cbctFee — the "value" the banner shows. */
  total: number;
  /** The order that consumed the gift, if any. */
  giftOrderId: string | null;
}

export const welcomeGiftService = {
  getStatus: async (): Promise<WelcomeGiftStatus> => {
    const res = await apiClient.get<WelcomeGiftStatus>('/welcome-gift');
    return res.data;
  },
};

/**
 * `PATCH /welcome-gift/doctors/:doctorId` (admin, super_admin) — sets or
 * clears a practitioner's gift mark. Idempotent: marking an already-used
 * gift keeps its original date. 404 when the user is not a dentist.
 */
export interface DoctorWelcomeGiftMark {
  doctorId: string;
  welcomeGiftUsedAt: string | null;
}

export const welcomeGiftAdminService = {
  setDoctorMark: async (
    doctorId: string,
    used: boolean,
  ): Promise<DoctorWelcomeGiftMark> => {
    const res = await apiClient.patch<DoctorWelcomeGiftMark>(
      `/welcome-gift/doctors/${doctorId}`,
      { used },
    );
    return res.data;
  },
};
