import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException } from '../../common/exceptions/app.exception';

export interface PublicViewerPayload {
  treatmentPlan: {
    id: string;
    name: string;
    version: number;
    resultViewUrl?: string | null;
  };
  /**
   * Display-only fields. We deliberately omit anything sensitive
   * (medical history, full patient name, payment data, internal
   * conversation, file metadata, etc.). The doctor's clinic name is
   * shown so the patient knows who shared the link with them.
   */
  doctor?: {
    fullName?: string | null;
    clinicName?: string | null;
  };
  /**
   * Patient first name + gender — both are needed for the welcome
   * salutation ("Dear Mr. <FirstName>" vs "Dear Ms. <FirstName>"). We
   * still don't expose the full name, date of birth, or any other
   * identifying detail.
   */
  patient?: {
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
      throw new NotFoundException('Invalid viewer link.');
    }

    const cacheKey = `treatment-viewer:${token}`;
    const cached = await this.cache.get<PublicViewerPayload>(cacheKey);
    if (cached) return cached;

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
            doctor: {
              select: {
                fullName: true,
                dentistProfile: { select: { clinicName: true } },
              },
            },
            patient: {
              select: { fullName: true, gender: true },
            },
          },
        },
      },
    });

    if (!plan || plan.deletedAt) {
      throw new NotFoundException(
        'This treatment link is no longer available.',
      );
    }
    if (plan.publicExpiresAt && plan.publicExpiresAt.getTime() < Date.now()) {
      throw new NotFoundException('This treatment link has expired.');
    }

    const payload: PublicViewerPayload = {
      treatmentPlan: {
        id: plan.id,
        name: plan.name,
        version: plan.version,
        resultViewUrl: plan.resultViewUrl ?? null,
      },
      doctor: plan.order.doctor
        ? {
            fullName: plan.order.doctor.fullName ?? null,
            clinicName: plan.order.doctor.dentistProfile?.clinicName ?? null,
          }
        : undefined,
      patient: plan.order.patient
        ? {
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

    // 10-minute TTL — short enough to honour revocations / URL edits,
    // long enough to absorb refresh spikes.
    await this.cache.set(cacheKey, payload, 10 * 60_000);
    return payload;
  }
}

function firstNameOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[0] ?? fullName;
}
