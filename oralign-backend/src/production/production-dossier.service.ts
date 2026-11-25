import { Injectable } from '@nestjs/common';
import type { Caller } from '../common/access/caller';
import { PrismaService } from '../prisma/prisma.service';
import { ProductionOrderGate } from './production-order-gate';
import type { ProductionDossier } from './production.contract';
import { toDossier } from './production.mapper';
import { DOSSIER_SELECT } from './production.selects';

/**
 * GET production/orders/:orderId/dossier: what the lab needs to make the
 * case, finance-free (D9): the prescription, the patient's name, gender
 * and age, the practitioner and clinic names, the files (no stored name,
 * no path), the latest approved plan with its deliverables, a child's
 * clinical answers. The access check and the read are ONE query (the
 * production scope is a where on the same findFirst, 14 statements).
 */
@Injectable()
export class ProductionDossierService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gate: ProductionOrderGate,
  ) {}

  async get(
    orderId: string,
    caller: Caller,
    now: Date = new Date(),
  ): Promise<ProductionDossier> {
    const row = await this.gate.requireReadable(orderId, caller, (where) =>
      this.prisma.dentalOrder.findFirst({ where, select: DOSSIER_SELECT }),
    );
    return toDossier(row, now);
  }
}
