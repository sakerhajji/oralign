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
  LocalizedTextDto,
  PackFilterDto,
  UpdatePackDto,
  UpdatePackPriceDto,
} from '../dto/pack.dto';

/**
 * Arch availability is now DATA-DRIVEN, not name-driven: a pack offers a
 * given arch iff it has an ACTIVE `PackPrice` for that arch. There is no
 * hardcoded pack-name whitelist anymore — the admin decides per pack by
 * setting (or clearing) the single-arch price. `getActivePriceForQuote`
 * already refuses an arch with no active price, so orders naturally
 * disable "single arch" for packs the admin priced two-arches-only.
 *
 * The legacy `isForOrthodontists` flag has been retired from product
 * behaviour: every pack is available to every practitioner. We still
 * accept the field in the DTOs for backward-compat (legacy rows in
 * the DB carry `true`), but it has no effect on what packs a doctor
 * can pick or which prices they see.
 */

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

    // French name is the required identity. New clients send it via
    // `nameI18n.fr`; legacy `name` is accepted as a fallback.
    const nameFr = (dto.nameI18n?.fr ?? dto.name)?.trim();
    if (!nameFr) {
      throw new BadRequestException(
        'A French product name is required (nameI18n.fr).',
      );
    }
    const descriptionFr = dto.descriptionI18n?.fr ?? dto.description ?? null;

    // Arch prices — legacy `price` maps to the two-arches price when the
    // caller didn't send the explicit field. At least one price required.
    const twoArchesPrice = dto.priceTwoArches ?? dto.price;
    const singleArchPrice =
      dto.priceSingleArch != null ? dto.priceSingleArch : undefined;
    const hasTwo = twoArchesPrice !== undefined && twoArchesPrice > 0;
    const hasSingle = singleArchPrice !== undefined && singleArchPrice > 0;
    if (!hasTwo && !hasSingle) {
      throw new BadRequestException(
        'At least one price is required (two arches or single arch).',
      );
    }
    const currency = dto.currency ?? 'TND';

    return this.prisma.$transaction(async (tx) => {
      const pack = await tx.pack.create({
        data: {
          // `name` stays the FR fallback; `nameI18n` is the localized bag.
          name: nameFr,
          description: descriptionFr,
          nameI18n: this.localizedBag(dto.nameI18n, nameFr)!,
          descriptionI18n: this.localizedBag(
            dto.descriptionI18n,
            descriptionFr ?? undefined,
          ),
          treatmentExpirationLabel: this.localizedBag(
            dto.treatmentExpirationLabel,
          ),
          finishingIncludedLabel: this.localizedBag(dto.finishingIncludedLabel),
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
      if (hasTwo) {
        await tx.packPrice.create({
          data: {
            packId: pack.id,
            archType: ArchType.two_arches,
            price: new Prisma.Decimal(twoArchesPrice!.toFixed(3)),
            currency,
            isActive: true,
          },
        });
      }
      if (hasSingle) {
        await tx.packPrice.create({
          data: {
            packId: pack.id,
            archType: ArchType.single_arch,
            price: new Prisma.Decimal(singleArchPrice!.toFixed(3)),
            currency,
            isActive: true,
          },
        });
      }
      this.logger.log(
        `Created pack ${pack.id} (${nameFr}) — two=${hasTwo ? twoArchesPrice : '—'}, single=${hasSingle ? singleArchPrice : '—'} ${currency}`,
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
    // Effective FR values for the legacy columns (kept in sync with the
    // localized bags). `undefined` = field not in this payload → no change.
    const nameFr = dto.nameI18n?.fr ?? dto.name;
    const descriptionFr = dto.descriptionI18n?.fr ?? dto.description;
    // Legacy `price` maps to the two-arches price when the explicit field
    // is absent.
    const twoArchesPrice =
      dto.priceTwoArches !== undefined ? dto.priceTwoArches : dto.price;

    // One transaction: pack columns + both arch prices land together so a
    // partial save can't leave the catalogue in a half-stale state.
    // Existing quotations that snapshotted a previous price are untouched
    // — we only ever mutate the catalogue rows, never a snapshot.
    return this.prisma.$transaction(async (tx) => {
      await tx.pack.update({
        where: { id },
        data: {
          // Keep the legacy string columns mirrored to FR.
          name: nameFr,
          description: descriptionFr,
          // Localized bags — only when the payload carried the field.
          nameI18n:
            dto.nameI18n !== undefined || dto.name !== undefined
              ? this.localizedBag(dto.nameI18n, nameFr)
              : undefined,
          descriptionI18n: this.localizedUpdate(
            dto.descriptionI18n,
            dto.description,
          ),
          treatmentExpirationLabel: this.localizedUpdate(
            dto.treatmentExpirationLabel,
          ),
          finishingIncludedLabel: this.localizedUpdate(
            dto.finishingIncludedLabel,
          ),
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
      // Reconcile each arch's ACTIVE price independently. `undefined` =
      // leave as-is; `null` = stop offering that arch; a number = upsert.
      await this.reconcileArchPrice(
        tx,
        id,
        ArchType.two_arches,
        twoArchesPrice,
        dto.currency,
      );
      await this.reconcileArchPrice(
        tx,
        id,
        ArchType.single_arch,
        dto.priceSingleArch,
        dto.currency,
      );
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
    await this.get(packId); // 404s if the pack is missing / soft-deleted
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
    // Arch availability is data-driven: if there's no active price for the
    // requested arch, the pack simply doesn't offer it.
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

  // ── Localized-content helpers ──────────────────────────────────

  /**
   * Build a `Localized<string>` bag `{ fr?, en? }` from a DTO (+ optional
   * FR fallback). Returns `undefined` when there's nothing to store so a
   * Prisma write leaves the column untouched / null.
   */
  private localizedBag(
    dto: LocalizedTextDto | undefined,
    fallbackFr?: string,
  ): Prisma.InputJsonValue | undefined {
    const fr = dto?.fr ?? fallbackFr;
    const en = dto?.en;
    if (fr === undefined && en === undefined) return undefined;
    const bag: Record<string, string> = {};
    if (fr !== undefined) bag.fr = fr;
    if (en !== undefined) bag.en = en;
    return bag;
  }

  /**
   * Resolve the Prisma write for a localized field on UPDATE:
   *   • field absent from payload (both undefined) → `undefined` (no change)
   *   • field present but empty → `Prisma.DbNull` (clear the column)
   *   • field present with content → the bag
   */
  private localizedUpdate(
    dto: LocalizedTextDto | undefined,
    legacy?: string,
  ): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
    if (dto === undefined && legacy === undefined) return undefined;
    const bag = this.localizedBag(dto, legacy);
    return bag ?? Prisma.DbNull;
  }

  /**
   * Reconcile the ACTIVE price for one `(pack, arch)`:
   *   • `undefined` → not in this payload, leave untouched
   *   • `null` / non-positive → stop offering this arch (archive active)
   *   • positive number → upsert (create or update the active row)
   *
   * Runs inside the caller's transaction. Skips no-op writes so a
   * re-submit doesn't churn the audit trail.
   */
  private async reconcileArchPrice(
    tx: Prisma.TransactionClient,
    packId: string,
    archType: ArchType,
    value: number | null | undefined,
    currency: string | undefined,
  ): Promise<void> {
    if (value === undefined) return;
    const active = await tx.packPrice.findFirst({
      where: { packId, archType, isActive: true },
    });
    if (value === null || value <= 0) {
      if (active) {
        // Archive the active row. Clear any pre-existing archived row for
        // this (pack, arch) first so the @@unique([packId, archType,
        // isActive]) constraint (one inactive row max) can't collide.
        await tx.packPrice.deleteMany({
          where: { packId, archType, isActive: false },
        });
        await tx.packPrice.update({
          where: { id: active.id },
          data: { isActive: false },
        });
      }
      return;
    }
    const decimal = new Prisma.Decimal(value.toFixed(3));
    if (active) {
      const currencyChanged =
        currency !== undefined && currency !== active.currency;
      const priceChanged = !active.price.equals(decimal);
      if (priceChanged || currencyChanged) {
        await tx.packPrice.update({
          where: { id: active.id },
          data: {
            price: priceChanged ? decimal : undefined,
            currency: currencyChanged ? currency : undefined,
          },
        });
      }
    } else {
      await tx.packPrice.create({
        data: {
          packId,
          archType,
          price: decimal,
          currency: currency ?? 'TND',
          isActive: true,
        },
      });
    }
  }
}

export type PackWithPrices = Prisma.PackGetPayload<{
  include: { prices: true };
}>;
