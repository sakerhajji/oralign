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
 * PRO + PRO+ ship as two-arches-only — clinical constraint, not an
 * audience one. Their step counts (36, unlimited) only make sense
 * across both arches, so a single-arch price would be misleading.
 * The whitelist below is the single source of truth — add future
 * two-arches-only packs ("PRO STARTER", …) by listing them here.
 *
 * The legacy `isForOrthodontists` flag has been retired from product
 * behaviour: every pack is available to every practitioner. We still
 * accept the field in the DTOs for backward-compat (legacy rows in
 * the DB carry `true`), but it has no effect on what packs a doctor
 * can pick or which prices they see.
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

  /**
   * Public catalogue — used by the marketing showcase to render the
   * Packs section dynamically. Returns ACTIVE, non-deleted packs only,
   * with each pack's ACTIVE prices attached. Deactivating a pack from
   * `/dashboard/packs` removes it from the public response on the
   * next fetch (React-Query stale-time is short on the marketing
   * page).
   *
   * No auth guard fronts this method — it's served by the public
   * `/api/packs/public` route, and the response shape is deliberately
   * limited to fields safe to expose (no audit columns, no admin
   * filtering primitives). Ordering matches the LITE → ESSENTIAL →
   * SMART → PRO → PRO+ commercial sequence so the showcase grid is
   * stable across renders.
   */
  async listPublic(): Promise<PackWithPrices[]> {
    return this.prisma.pack.findMany({
      where: { deletedAt: null, isActive: true },
      include: {
        // Only the active prices land in the public payload. An admin
        // who archives a single-arch price keeps the row in the DB
        // for audit; the marketing page only sees what's currently
        // sellable.
        prices: { where: { isActive: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
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
    // One transaction so the pack + its initial price land together
    // (or neither does). If the admin didn't pass a price, we create
    // the pack alone — they can add prices later via the inline
    // Update flow. The two-arches archType is the canonical pricing
    // unit; the per-arch concept is invisible in the admin UI now.
    return this.prisma.$transaction(async (tx) => {
      const pack = await tx.pack.create({
        data: {
          name: dto.name,
          description: dto.description ?? null,
          maxStepsPerArch: dto.isUnlimitedSteps
            ? null
            : dto.maxStepsPerArch ?? null,
          includedCorrections: dto.isUnlimitedCorrections
            ? null
            : dto.includedCorrections ?? null,
          isUnlimitedSteps: dto.isUnlimitedSteps ?? false,
          isUnlimitedCorrections: dto.isUnlimitedCorrections ?? false,
          isForOrthodontists: dto.isForOrthodontists ?? false,
          isActive: dto.isActive ?? true,
        },
      });
      if (dto.price !== undefined) {
        await tx.packPrice.create({
          data: {
            packId: pack.id,
            archType: ArchType.two_arches,
            price: new Prisma.Decimal(dto.price.toFixed(3)),
            currency: dto.currency ?? 'TND',
            isActive: true,
          },
        });
      }
      this.logger.log(
        `Created pack ${pack.id} (${pack.name})${
          dto.price !== undefined ? ` with price ${dto.price}` : ''
        }`,
      );
      return tx.pack.findUniqueOrThrow({
        where: { id: pack.id },
        include: { prices: true },
      });
    });
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
    // One transaction: pack columns + inline-price update land
    // together so a partial save can't leave the catalogue in a
    // half-stale state. When `dto.price` is provided we update the
    // active two_arches price (or create one if none exists yet).
    // Existing quotations that snapshotted the previous price are
    // unaffected — we never touch a snapshot.
    return this.prisma.$transaction(async (tx) => {
      await tx.pack.update({
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
      });
      if (dto.price !== undefined) {
        const activeTwoArches = await tx.packPrice.findFirst({
          where: { packId: id, archType: ArchType.two_arches, isActive: true },
        });
        const decimalPrice = new Prisma.Decimal(dto.price.toFixed(3));
        if (activeTwoArches) {
          // Same currency + same number → no-op (skip the write).
          // Avoids generating a churny audit trail when the admin
          // re-submits the form without changing the price.
          const currencyChanged =
            dto.currency !== undefined &&
            dto.currency !== activeTwoArches.currency;
          const priceChanged = !activeTwoArches.price.equals(decimalPrice);
          if (priceChanged || currencyChanged) {
            await tx.packPrice.update({
              where: { id: activeTwoArches.id },
              data: {
                price: priceChanged ? decimalPrice : undefined,
                currency: currencyChanged ? dto.currency : undefined,
              },
            });
          }
        } else {
          await tx.packPrice.create({
            data: {
              packId: id,
              archType: ArchType.two_arches,
              price: decimalPrice,
              currency: dto.currency ?? 'TND',
              isActive: true,
            },
          });
        }
      }
      return tx.pack.findUniqueOrThrow({
        where: { id },
        include: { prices: true },
      });
    });
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
