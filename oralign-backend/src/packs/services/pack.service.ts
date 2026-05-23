import { Injectable, Logger } from '@nestjs/common';
import { ArchType, Pack, PackPrice, Prisma } from '@prisma/client';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import { PaginatedResponse } from '../../common/dto/response.dto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreatePackDto,
  CreatePackPriceDto,
  PackFilterDto,
  UpdatePackDto,
  UpdatePackPriceDto,
} from '../dto/pack.dto';

/**
 * PRO + PRO+ are orthodontist-only and must be priced for two arches
 * only. The whitelist below is the single source of truth — adding a
 * future "PRO STARTER" works by listing it here.
 */
const TWO_ARCH_ONLY_PACK_NAMES = new Set<string>(['PRO', 'PRO+']);

@Injectable()
export class PackService {
  private readonly logger = new Logger(PackService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Pack CRUD ──────────────────────────────────────────────────

  async list(
    filters: PackFilterDto,
  ): Promise<PaginatedResponse<PackWithPrices>> {
    const take = Math.min(Math.max(filters.limit ?? 25, 1), 100);
    const page = Math.max(filters.page ?? 1, 1);
    const skip = (page - 1) * take;
    const where: Prisma.PackWhereInput = {};
    if (!filters.includeInactive) {
      where.deletedAt = null;
      where.isActive = true;
    }
    if (filters.search) {
      where.name = { contains: filters.search, mode: 'insensitive' };
    }
    const [rows, total] = await Promise.all([
      this.prisma.pack.findMany({
        where,
        skip,
        take,
        orderBy: { name: 'asc' },
        include: { prices: true },
      }),
      this.prisma.pack.count({ where }),
    ]);
    return new PaginatedResponse(rows, total, page, take, Math.ceil(total / take));
  }

  async get(id: string): Promise<PackWithPrices> {
    const pack = await this.prisma.pack.findUnique({
      where: { id },
      include: { prices: true },
    });
    if (!pack || pack.deletedAt) {
      throw new NotFoundException('Pack not found');
    }
    return pack;
  }

  async create(dto: CreatePackDto): Promise<PackWithPrices> {
    this.assertUnlimitedShape(dto);
    const pack = await this.prisma.pack.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        maxStepsPerArch: dto.isUnlimitedSteps ? null : dto.maxStepsPerArch ?? null,
        includedCorrections: dto.isUnlimitedCorrections
          ? null
          : dto.includedCorrections ?? null,
        isUnlimitedSteps: dto.isUnlimitedSteps ?? false,
        isUnlimitedCorrections: dto.isUnlimitedCorrections ?? false,
        isForOrthodontists: dto.isForOrthodontists ?? false,
        isActive: dto.isActive ?? true,
      },
      include: { prices: true },
    });
    this.logger.log(`Created pack ${pack.id} (${pack.name})`);
    return pack;
  }

  async update(id: string, dto: UpdatePackDto): Promise<PackWithPrices> {
    const current = await this.get(id);
    this.assertUnlimitedShape({
      isUnlimitedSteps: dto.isUnlimitedSteps ?? current.isUnlimitedSteps,
      isUnlimitedCorrections:
        dto.isUnlimitedCorrections ?? current.isUnlimitedCorrections,
      maxStepsPerArch:
        dto.maxStepsPerArch !== undefined
          ? dto.maxStepsPerArch
          : current.maxStepsPerArch,
      includedCorrections:
        dto.includedCorrections !== undefined
          ? dto.includedCorrections
          : current.includedCorrections,
    });
    const updated = await this.prisma.pack.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        maxStepsPerArch:
          dto.isUnlimitedSteps === true
            ? null
            : dto.maxStepsPerArch !== undefined
              ? dto.maxStepsPerArch
              : undefined,
        includedCorrections:
          dto.isUnlimitedCorrections === true
            ? null
            : dto.includedCorrections !== undefined
              ? dto.includedCorrections
              : undefined,
        isUnlimitedSteps: dto.isUnlimitedSteps,
        isUnlimitedCorrections: dto.isUnlimitedCorrections,
        isForOrthodontists: dto.isForOrthodontists,
        isActive: dto.isActive,
      },
      include: { prices: true },
    });
    return updated;
  }

  async softDelete(id: string): Promise<{ id: string; deletedAt: Date }> {
    const current = await this.get(id);
    const updated = await this.prisma.pack.update({
      where: { id: current.id },
      data: { deletedAt: new Date(), isActive: false },
      select: { id: true, deletedAt: true },
    });
    return { id: updated.id, deletedAt: updated.deletedAt! };
  }

  async setActive(id: string, active: boolean): Promise<PackWithPrices> {
    const current = await this.get(id);
    if (current.deletedAt && active) {
      throw new BadRequestException(
        'Cannot reactivate a soft-deleted pack.',
      );
    }
    const updated = await this.prisma.pack.update({
      where: { id },
      data: { isActive: active },
      include: { prices: true },
    });
    return updated;
  }

  // ── Price management ───────────────────────────────────────────

  async addPrice(
    packId: string,
    dto: CreatePackPriceDto,
  ): Promise<PackPrice> {
    const pack = await this.get(packId);
    this.assertArchTypeAllowed(pack, dto.archType);
    // The (packId, archType, isActive) unique index lets multiple
    // archived prices co-exist with a single active one. If the
    // caller is trying to add a new active price for an arch that
    // already has one, archive the previous before inserting.
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.packPrice.findFirst({
        where: { packId, archType: dto.archType, isActive: true },
      });
      if (existing) {
        await tx.packPrice.update({
          where: { id: existing.id },
          data: { isActive: false },
        });
      }
      const created = await tx.packPrice.create({
        data: {
          packId,
          archType: dto.archType,
          price: new Prisma.Decimal(dto.price.toFixed(3)),
          currency: dto.currency ?? 'TND',
          isActive: true,
        },
      });
      return created;
    });
  }

  async updatePrice(
    packId: string,
    priceId: string,
    dto: UpdatePackPriceDto,
  ): Promise<PackPrice> {
    const existing = await this.prisma.packPrice.findUnique({
      where: { id: priceId },
    });
    if (!existing || existing.packId !== packId) {
      throw new NotFoundException('Price not found on this pack.');
    }
    if (dto.isActive === true && !existing.isActive) {
      // Re-activating: ensure no OTHER active row already exists for
      // this (pack, arch). If so, archive the conflict first.
      const conflict = await this.prisma.packPrice.findFirst({
        where: {
          packId: existing.packId,
          archType: existing.archType,
          isActive: true,
          NOT: { id: priceId },
        },
      });
      if (conflict) {
        return this.prisma.$transaction(async (tx) => {
          await tx.packPrice.update({
            where: { id: conflict.id },
            data: { isActive: false },
          });
          return tx.packPrice.update({
            where: { id: priceId },
            data: {
              price:
                dto.price !== undefined
                  ? new Prisma.Decimal(dto.price.toFixed(3))
                  : undefined,
              currency: dto.currency,
              isActive: true,
            },
          });
        });
      }
    }
    return this.prisma.packPrice.update({
      where: { id: priceId },
      data: {
        price:
          dto.price !== undefined
            ? new Prisma.Decimal(dto.price.toFixed(3))
            : undefined,
        currency: dto.currency,
        isActive: dto.isActive,
      },
    });
  }

  async archivePrice(
    packId: string,
    priceId: string,
  ): Promise<{ id: string; isActive: false }> {
    const existing = await this.prisma.packPrice.findUnique({
      where: { id: priceId },
    });
    if (!existing || existing.packId !== packId) {
      throw new NotFoundException('Price not found on this pack.');
    }
    if (!existing.isActive) {
      // Idempotent — already archived.
      return { id: priceId, isActive: false };
    }
    await this.prisma.packPrice.update({
      where: { id: priceId },
      data: { isActive: false },
    });
    return { id: priceId, isActive: false };
  }

  // ── Helpers exposed to QuotationService ─────────────────────────

  /**
   * Look up the ACTIVE price for `(packId, archType)`. Throws if
   * the pack is inactive / deleted / doesn't expose that arch — the
   * exact safety net that prevents a quote from snapshot-ing a stale
   * or invalid price at attach-pack time.
   */
  async getActivePriceForQuote(
    packId: string,
    archType: ArchType,
  ): Promise<{ pack: Pack; price: PackPrice }> {
    const pack = await this.prisma.pack.findUnique({
      where: { id: packId },
    });
    if (!pack || pack.deletedAt || !pack.isActive) {
      throw new BadRequestException(
        'Pack is unavailable. Pick an active pack to issue a quote.',
      );
    }
    this.assertArchTypeAllowed(pack, archType);
    const price = await this.prisma.packPrice.findFirst({
      where: { packId, archType, isActive: true },
    });
    if (!price) {
      throw new BadRequestException(
        `No active price configured for ${pack.name} (${archType}).`,
      );
    }
    return { pack, price };
  }

  // ── Invariants ─────────────────────────────────────────────────

  private assertUnlimitedShape(args: {
    isUnlimitedSteps?: boolean;
    isUnlimitedCorrections?: boolean;
    maxStepsPerArch?: number | null;
    includedCorrections?: number | null;
  }): void {
    if (
      args.isUnlimitedSteps === true &&
      args.maxStepsPerArch !== null &&
      args.maxStepsPerArch !== undefined
    ) {
      throw new BadRequestException(
        'maxStepsPerArch must be null when isUnlimitedSteps is true.',
      );
    }
    if (
      args.isUnlimitedSteps === false &&
      (args.maxStepsPerArch === null || args.maxStepsPerArch === undefined)
    ) {
      throw new BadRequestException(
        'maxStepsPerArch is required when isUnlimitedSteps is false.',
      );
    }
    if (
      args.isUnlimitedCorrections === true &&
      args.includedCorrections !== null &&
      args.includedCorrections !== undefined
    ) {
      throw new BadRequestException(
        'includedCorrections must be null when isUnlimitedCorrections is true.',
      );
    }
  }

  private assertArchTypeAllowed(
    pack: { name: string },
    arch: ArchType,
  ): void {
    if (TWO_ARCH_ONLY_PACK_NAMES.has(pack.name) && arch !== ArchType.two_arches) {
      throw new BadRequestException(
        `${pack.name} only supports two arches.`,
      );
    }
  }
}

export type PackWithPrices = Prisma.PackGetPayload<{
  include: { prices: true };
}>;
