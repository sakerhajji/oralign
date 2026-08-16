import { Injectable, Logger } from '@nestjs/common';
import { AppointmentStatus, DayOfWeek, VerificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../common/exceptions/app.exception';
import { DEFAULT_LANG, Lang, pickLang } from '../common/i18n/lang';
import { CreateAppointmentDto } from './dto/appointment.dto';
import { env } from '../common/config/env';

// ─── Booking constants ──────────────────────────────────────────────────────
const SLOT_MINUTES = 30; // slot granularity
const BOOKING_BUFFER_MINUTES = 60; // no slot inside now + this buffer
const DEFAULT_WINDOW_DAYS = 14;
const MAX_WINDOW_DAYS = 30;

/**
 * JS `Date.getDay()` returns 0=Sunday … 6=Saturday. The Prisma `DayOfWeek`
 * enum is lowercase monday..sunday — map by that numeric index so the two
 * never drift.
 */
const WEEKDAY_BY_INDEX: DayOfWeek[] = [
  DayOfWeek.sunday,
  DayOfWeek.monday,
  DayOfWeek.tuesday,
  DayOfWeek.wednesday,
  DayOfWeek.thursday,
  DayOfWeek.friday,
  DayOfWeek.saturday,
];

const BOOKED_STATUSES = [AppointmentStatus.pending, AppointmentStatus.accepted];

export interface AvailabilityDay {
  date: string; // YYYY-MM-DD
  dayOfWeek: DayOfWeek;
  slots: string[]; // ISO datetimes, available only
}

export interface AvailabilityResult {
  days: AvailabilityDay[];
  nextAvailable: string | null;
}

/**
 * Raised when the requested slot is no longer bookable. Carries the next
 * available slot so the controller can return `{ message, nextAvailable }`
 * with a 409 (the shared exception filter only serialises message/code, so
 * the controller handles this one explicitly).
 */
export class SlotUnavailableException extends ConflictException {
  constructor(
    public readonly nextAvailable: string | null,
    message = 'The selected time slot is no longer available',
  ) {
    super(message);
    this.name = 'SlotUnavailableException';
  }
}

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  // ─── Availability ─────────────────────────────────────────────────────────

  /**
   * Public availability grid for a listed practitioner. 404s if the profile
   * is missing / not public / not approved so private clinics never leak
   * their schedule.
   */
  async getAvailability(
    dentistProfileId: string,
    from?: string,
    days?: number,
  ): Promise<AvailabilityResult> {
    await this.assertBookableProfile(dentistProfileId);
    return this.computeAvailability(dentistProfileId, from, days);
  }

  /**
   * Core slot computation — assumes the caller already validated the profile.
   * Reads the weekly WorkingHours + the pending/accepted appointments in the
   * window, then emits every free 30-min start per day.
   */
  private async computeAvailability(
    dentistProfileId: string,
    from?: string,
    days?: number,
  ): Promise<AvailabilityResult> {
    const windowDays = this.clampDays(days);
    const startDate = this.parseFromDate(from);
    const rangeStart = startDate;
    const rangeEnd = this.addDays(startDate, windowDays);

    const [workingHours, booked] = await Promise.all([
      this.prisma.workingHours.findMany({ where: { dentistProfileId } }),
      this.prisma.appointment.findMany({
        where: {
          dentistProfileId,
          status: { in: BOOKED_STATUSES },
          requestedAt: { gte: rangeStart, lt: rangeEnd },
        },
        select: { requestedAt: true },
      }),
    ]);

    const hoursByDay = new Map<DayOfWeek, (typeof workingHours)[number]>();
    for (const wh of workingHours) hoursByDay.set(wh.dayOfWeek, wh);

    const takenSet = new Set<number>(
      booked.map((a) => a.requestedAt.getTime()),
    );

    const earliestAllowed = Date.now() + BOOKING_BUFFER_MINUTES * 60_000;

    const outDays: AvailabilityDay[] = [];
    let nextAvailable: string | null = null;

    for (let i = 0; i < windowDays; i++) {
      const day = this.addDays(startDate, i);
      const dayOfWeek = WEEKDAY_BY_INDEX[day.getDay()];
      const wh = hoursByDay.get(dayOfWeek);
      const slots: string[] = [];

      if (wh && !wh.isClosed) {
        const openMin = this.toMinutes(wh.openTime);
        const closeMin = this.toMinutes(wh.closeTime);
        if (openMin !== null && closeMin !== null) {
          for (
            let m = openMin;
            m + SLOT_MINUTES <= closeMin;
            m += SLOT_MINUTES
          ) {
            const slot = new Date(day);
            slot.setHours(Math.floor(m / 60), m % 60, 0, 0);
            const ts = slot.getTime();
            if (ts <= earliestAllowed) continue;
            if (takenSet.has(ts)) continue;
            const iso = slot.toISOString();
            slots.push(iso);
            if (nextAvailable === null) nextAvailable = iso;
          }
        }
      }

      outDays.push({ date: this.formatYMD(day), dayOfWeek, slots });
    }

    return { days: outDays, nextAvailable };
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(
    dto: CreateAppointmentDto,
  ): Promise<{ id: string; status: 'pending'; requestedAt: string }> {
    const requestedAt = new Date(dto.requestedAt);
    if (Number.isNaN(requestedAt.getTime())) {
      throw new BadRequestException('requestedAt is not a valid date');
    }

    const profile = await this.prisma.dentistProfile.findFirst({
      where: {
        id: dto.dentistProfileId,
        deletedAt: null,
        isListedPublicly: true,
        user: { verificationStatus: VerificationStatus.approved, isActive: true },
      },
      select: {
        id: true,
        clinicName: true,
        clinicAddress: true,
        user: {
          select: { fullName: true, email: true, preferredLanguage: true },
        },
      },
    });
    if (!profile) {
      throw new NotFoundException('Practitioner not found');
    }

    // SECURITY (audit M-8): bound calendar-squatting + practitioner
    // mail-bombing from a single email. Each unauthenticated booking
    // creates a `pending` row that both blocks a public slot and emails
    // the practitioner, so cap how many active (pending/accepted) requests
    // one email may hold — per practitioner and overall. The per-IP
    // throttle limits burst rate; this limits the standing footprint a
    // rotating-IP attacker can accumulate.
    const MAX_ACTIVE_PER_PROFILE = 3;
    const MAX_ACTIVE_PER_EMAIL = 8;
    const emailMatch = {
      equals: dto.patientEmail.trim(),
      mode: 'insensitive' as const,
    };
    const [activeForProfile, activeForEmail] = await Promise.all([
      this.prisma.appointment.count({
        where: {
          dentistProfileId: profile.id,
          patientEmail: emailMatch,
          status: { in: BOOKED_STATUSES },
        },
      }),
      this.prisma.appointment.count({
        where: {
          patientEmail: emailMatch,
          status: { in: BOOKED_STATUSES },
        },
      }),
    ]);
    if (
      activeForProfile >= MAX_ACTIVE_PER_PROFILE ||
      activeForEmail >= MAX_ACTIVE_PER_EMAIL
    ) {
      throw new BadRequestException(
        'You already have several pending appointment requests. Please wait for them to be handled before booking more.',
      );
    }

    // Re-derive availability for the requested day and confirm the exact slot
    // is still on offer (respects the buffer, working hours, alignment AND
    // existing bookings). The frontend echoes back an ISO string it received
    // from the availability grid, so the equality is exact.
    const dayGrid = await this.computeAvailability(
      profile.id,
      this.formatYMD(requestedAt),
      1,
    );
    const wanted = requestedAt.toISOString();
    const offered = dayGrid.days.some((d) => d.slots.includes(wanted));
    if (!offered) {
      const full = await this.computeAvailability(profile.id);
      throw new SlotUnavailableException(full.nextAvailable);
    }

    const patientLang = pickLang(dto.lang);

    // Guard the double-booking race: re-check "taken" and insert in one
    // transaction. The DB has no unique on (profile, requestedAt), so this is
    // the tightest guard available without a schema change.
    const created = await this.prisma.$transaction(async (tx) => {
      // Serialize concurrent bookings of the SAME slot. There is no partial
      // unique index on (profile, requestedAt), and under READ COMMITTED the
      // clash-check below would not see a sibling transaction's uncommitted
      // insert. A transaction-scoped advisory lock keyed on profile+slot makes
      // the check-then-insert atomic against other bookers of this exact slot
      // (and releases automatically at commit/rollback).
      const lockKey = `appt:${profile.id}:${requestedAt.toISOString()}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      const clash = await tx.appointment.findFirst({
        where: {
          dentistProfileId: profile.id,
          requestedAt,
          status: { in: BOOKED_STATUSES },
        },
        select: { id: true },
      });
      if (clash) return null;
      return tx.appointment.create({
        data: {
          dentistProfileId: profile.id,
          patientName: dto.patientName,
          patientEmail: dto.patientEmail,
          patientPhone: dto.patientPhone ?? null,
          patientAddress: dto.patientAddress ?? null,
          message: dto.message ?? null,
          requestedAt,
          patientLang,
        },
      });
    });

    if (!created) {
      const full = await this.computeAvailability(profile.id);
      throw new SlotUnavailableException(full.nextAvailable);
    }

    // Fire-and-forget both emails — a flaky SMTP relay must never fail the
    // patient's booking. Patient copy uses the patient's chosen language; the
    // practitioner copy uses their stored preference.
    const practitionerLang = pickLang(profile.user.preferredLanguage);

    void this.safeSend(() =>
      this.mail.sendAppointmentRequestedToPatient({
        to: dto.patientEmail,
        lang: patientLang,
        patientName: dto.patientName,
        practitionerName: profile.user.fullName,
        clinicName: profile.clinicName,
        clinicAddress: profile.clinicAddress,
        requestedAtLabel: this.formatDateTime(requestedAt, patientLang),
      }),
    );

    void this.safeSend(() =>
      this.mail.sendAppointmentRequestToPractitioner({
        to: profile.user.email,
        lang: practitionerLang,
        practitionerName: profile.user.fullName,
        patientName: dto.patientName,
        patientEmail: dto.patientEmail,
        patientPhone: dto.patientPhone,
        patientMessage: dto.message,
        clinicName: profile.clinicName,
        requestedAtLabel: this.formatDateTime(requestedAt, practitionerLang),
        acceptUrl: this.actionUrl(created.actionToken, 'accept'),
        declineUrl: this.actionUrl(created.actionToken, 'decline'),
      }),
    );

    return {
      id: created.id,
      status: 'pending',
      requestedAt: created.requestedAt.toISOString(),
    };
  }

  // ─── Practitioner accept / decline (from the email link) ───────────────────

  /**
   * Idempotent tokenized response. Unknown token or an already-handled
   * request returns a neutral page (no error — the link may have been
   * clicked twice or forwarded). On a fresh pending request it flips the
   * status and emails the patient the final decision. Returns the HTML the
   * controller serves back to the practitioner's browser.
   */
  async respond(token: string, decision: 'accepted' | 'declined'): Promise<string> {
    const appt = await this.prisma.appointment.findUnique({
      where: { actionToken: token },
      select: {
        id: true,
        status: true,
        patientName: true,
        patientEmail: true,
        patientLang: true,
        requestedAt: true,
        dentistProfile: {
          select: {
            clinicName: true,
            clinicAddress: true,
            user: { select: { fullName: true, preferredLanguage: true } },
          },
        },
      },
    });

    if (!appt || appt.status !== AppointmentStatus.pending) {
      const lang = appt
        ? pickLang(appt.dentistProfile.user.preferredLanguage)
        : DEFAULT_LANG;
      return this.renderActionPage('already', lang);
    }

    const practitionerLang = pickLang(appt.dentistProfile.user.preferredLanguage);

    // Atomic pending → decision flip. If a concurrent click already handled
    // it, updateMany matches 0 rows and we show the neutral page.
    const result = await this.prisma.appointment.updateMany({
      where: { id: appt.id, status: AppointmentStatus.pending },
      data: {
        status:
          decision === 'accepted'
            ? AppointmentStatus.accepted
            : AppointmentStatus.declined,
        respondedAt: new Date(),
      },
    });
    if (result.count === 0) {
      return this.renderActionPage('already', practitionerLang);
    }

    const patientLang = pickLang(appt.patientLang);
    void this.safeSend(() =>
      this.mail.sendAppointmentDecisionToPatient({
        to: appt.patientEmail,
        lang: patientLang,
        patientName: appt.patientName,
        practitionerName: appt.dentistProfile.user.fullName,
        clinicName: appt.dentistProfile.clinicName,
        clinicAddress: appt.dentistProfile.clinicAddress,
        requestedAtLabel: this.formatDateTime(appt.requestedAt, patientLang),
        decision,
      }),
    );

    return this.renderActionPage(decision, practitionerLang);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private async assertBookableProfile(dentistProfileId: string): Promise<void> {
    const profile = await this.prisma.dentistProfile.findFirst({
      where: {
        id: dentistProfileId,
        deletedAt: null,
        isListedPublicly: true,
        user: { verificationStatus: VerificationStatus.approved, isActive: true },
      },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException('Practitioner not found');
    }
  }

  private clampDays(days?: number): number {
    if (!days || !Number.isFinite(days)) return DEFAULT_WINDOW_DAYS;
    return Math.min(Math.max(Math.floor(days), 1), MAX_WINDOW_DAYS);
  }

  /** Local midnight of `from` (YYYY-MM-DD) or of today when omitted. */
  private parseFromDate(from?: string): Date {
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
      const [y, mo, d] = from.split('-').map((s) => parseInt(s, 10));
      const parsed = new Date(y, mo - 1, d);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  private addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  /** "HH:mm" → minutes since midnight, or null when malformed. */
  private toMinutes(hhmm: string): number | null {
    const m = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/.exec(hhmm);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }

  private formatYMD(date: Date): string {
    const y = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }

  /** Human date+time per language (server default timezone). */
  private formatDateTime(date: Date, lang: Lang): string {
    const locale = lang === 'fr' ? 'fr-FR' : 'en-GB';
    try {
      return new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    } catch {
      return date.toISOString();
    }
  }

  /**
   * Absolute URL of the accept/decline action endpoint. These links live in
   * the practitioner's email and open in a browser, so they must point at the
   * public API origin (global prefix `/api`), not the frontend.
   */
  private actionUrl(token: string, action: 'accept' | 'decline'): string {
    const configured = env.apiPublicUrl;
    if (!configured && env.isProd) {
      // Fail loud in the logs: the email still goes out, but its
      // accept/decline links point at localhost and are dead for the
      // recipient. Set API_PUBLIC_URL (public origin of this API,
      // no /api suffix) in the deployment environment.
      this.logger.error(
        'API_PUBLIC_URL is not set — appointment accept/decline email ' +
          'links will point at http://localhost:3000 and will not work.',
      );
    }
    const base = (configured || 'http://localhost:3000').replace(/\/$/, '');
    return `${base}/api/appointments/action/${token}/${action}`;
  }

  private async safeSend(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.warn(`Appointment email failed: ${(err as Error).message}`);
    }
  }

  /**
   * Minimal branded (black-and-white, matches the email aesthetic) HTML page
   * shown to the practitioner after they click an accept/decline link.
   */
  private renderActionPage(
    kind: 'accepted' | 'declined' | 'already',
    lang: Lang,
  ): string {
    const COPY: Record<
      'accepted' | 'declined' | 'already',
      Record<Lang, { title: string; body: string }>
    > = {
      accepted: {
        en: {
          title: 'Appointment accepted',
          body: 'The request has been accepted. The patient has been notified by email.',
        },
        fr: {
          title: 'Rendez-vous accepté',
          body: 'La demande a été acceptée. Le patient a été informé par e-mail.',
        },
      },
      declined: {
        en: {
          title: 'Appointment declined',
          body: 'The request has been declined. The patient has been notified by email.',
        },
        fr: {
          title: 'Rendez-vous refusé',
          body: 'La demande a été refusée. Le patient a été informé par e-mail.',
        },
      },
      already: {
        en: {
          title: 'Request already handled',
          body: 'This request was already handled or the link is no longer valid. You can safely close this page.',
        },
        fr: {
          title: 'Demande déjà traitée',
          body: "Cette demande a déjà été traitée ou le lien n'est plus valide. Vous pouvez fermer cette page en toute sécurité.",
        },
      },
    };
    const t = COPY[kind][lang];
    const year = new Date().getFullYear();
    return `<!DOCTYPE html>
<html lang="${lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${t.title}</title>
  </head>
  <body style="margin:0;padding:0;background:#ffffff;color:#000000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
      <tr>
        <td align="center" style="padding:48px 16px;">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;width:100%;border:1px solid #000000;">
            <tr>
              <td style="padding:32px;text-align:center;">
                <p style="margin:0 0 20px;font-size:13px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#000000;">Oralign</p>
                <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#000000;">${t.title}</h1>
                <p style="margin:0;font-size:15px;line-height:1.6;color:#555555;">${t.body}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;background:#f5f5f5;border-top:1px solid #000000;text-align:center;">
                <p style="margin:0;font-size:12px;color:#555555;">&copy; ${year} Oralign.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  }
}
