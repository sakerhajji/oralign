import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { OnEvent } from '@nestjs/event-emitter';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../../prisma/prisma.service';
import {
  GoneException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import {
  DOCTOR_PUBLIC_SELECT,
  toDoctorPublicIdentity,
} from '../../common/doctor/doctor-identity';
import {
  NotificationEvents,
  type UserProfileChangedEvent,
} from '../../notifications/events/notification-events';

/** Cache key of one plan link's payload (10 min at most). */
export const viewerCacheKey = (token: string) => `treatment-viewer:${token}`;

export interface PublicViewerPayload {
  treatmentPlan: {
    id: string;
    name: string;
    version: number;
    resultViewUrl?: string | null;
    publicExpiresAt?: string | null;
  };
  /**
   * Display-only fields. We deliberately omit anything sensitive
   * (medical history, payment data, internal conversation, file
   * metadata, etc.). The doctor's clinic name is
   * shown so the patient knows who shared the link with them.
   */
  doctor?: {
    fullName?: string | null;
    clinicName?: string | null;
  };
  /**
   * Patient name + gender, for the welcome salutation ("Dear Mr. <Full
   * Name>"). The full name is the owner's choice: the link is private to
   * the patient. No date of birth or other identifying detail is exposed.
   * `firstName` stays for payloads cached before `fullName` existed.
   */
  patient?: {
    fullName?: string | null;
    firstName?: string | null;
    gender?: 'male' | 'female' | 'other' | null;
  };
}

@Injectable()
export class PublicTreatmentViewerService {
  private readonly logger = new Logger(PublicTreatmentViewerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async getByToken(token: string): Promise<PublicViewerPayload> {
    if (!token || token.length < 8) {
      throw new NotFoundException(
        'Invalid viewer link.',
        'PUBLIC_LINK_INVALID',
      );
    }

    const cacheKey = viewerCacheKey(token);
    const cached = await this.cache.get<PublicViewerPayload>(cacheKey);
    if (cached) {
      const expiresAt = cached.treatmentPlan.publicExpiresAt
        ? new Date(cached.treatmentPlan.publicExpiresAt).getTime()
        : null;
      if (expiresAt && expiresAt < Date.now()) {
        await this.cache.del(cacheKey);
        throw new GoneException(
          'This treatment link has expired.',
          'PUBLIC_LINK_EXPIRED',
        );
      }
      return cached;
    }

    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { publicToken: token },
      select: {
        id: true,
        name: true,
        version: true,
        resultViewUrl: true,
        publicExpiresAt: true,
        deletedAt: true,
        order: {
          select: {
            deletedAt: true,
            // The one anonymous projection of a doctor: name + practice.
            doctor: { select: DOCTOR_PUBLIC_SELECT },
            patient: {
              select: { fullName: true, gender: true },
            },
          },
        },
      },
    });

    if (!plan || plan.deletedAt || plan.order.deletedAt) {
      throw new NotFoundException(
        'This treatment link is no longer available.',
        'PUBLIC_LINK_NOT_FOUND',
      );
    }
    if (plan.publicExpiresAt && plan.publicExpiresAt.getTime() < Date.now()) {
      throw new GoneException(
        'This treatment link has expired.',
        'PUBLIC_LINK_EXPIRED',
      );
    }

    const payload: PublicViewerPayload = {
      treatmentPlan: {
        id: plan.id,
        name: plan.name,
        version: plan.version,
        resultViewUrl: plan.resultViewUrl ?? null,
        publicExpiresAt: plan.publicExpiresAt?.toISOString() ?? null,
      },
      doctor: toDoctorPublicIdentity(plan.order.doctor),
      patient: plan.order.patient
        ? {
            fullName: plan.order.patient.fullName.trim(),
            firstName: firstNameOf(plan.order.patient.fullName),
            // Prisma exposes the enum as lowercase strings already
            // (e.g. 'male'); pass it through but narrow to the
            // payload's union to keep the contract explicit.
            gender: (plan.order.patient.gender ?? null) as
              | 'male'
              | 'female'
              | 'other'
              | null,
          }
        : undefined,
    };

    // Keep the cache short, and never longer than the public link expiry.
    // Otherwise a just-expired link could remain readable until cache TTL.
    const ttlMs = plan.publicExpiresAt
      ? Math.max(
          1_000,
          Math.min(10 * 60_000, plan.publicExpiresAt.getTime() - Date.now()),
        )
      : 10 * 60_000;
    await this.cache.set(cacheKey, payload, ttlMs);
    return payload;
  }

  /**
   * The doctor renamed himself or his practice: drop the cached payload
   * of every link of his still open, so the patient reads the current
   * name instead of the one cached up to 10 minutes ago. One indexed read
   * of the tokens, then one DEL per link; expired links have no entry
   * (the TTL never outlives the expiry). Failures are logged and
   * swallowed: the profile write already committed.
   */
  @OnEvent(NotificationEvents.UserProfileChanged)
  async onUserProfileChanged(
    event: UserProfileChangedEvent,
    now: Date = new Date(),
  ): Promise<void> {
    try {
      const plans = await this.prisma.treatmentPlan.findMany({
        where: {
          publicToken: { not: null },
          order: { doctorId: event.userId },
          OR: [{ publicExpiresAt: null }, { publicExpiresAt: { gt: now } }],
        },
        select: { publicToken: true },
      });
      const keys = plans
        .map((plan) => plan.publicToken)
        .filter((token): token is string => !!token)
        .map(viewerCacheKey);
      await Promise.all(keys.map((key) => this.cache.del(key)));
    } catch (err) {
      this.logger.warn(
        `plan link cache invalidation for user ${event.userId} failed: ${(err as Error).message}`,
      );
    }
  }
}

function firstNameOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[0] ?? fullName;
}
