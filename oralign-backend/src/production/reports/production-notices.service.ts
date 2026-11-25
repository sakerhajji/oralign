import { Injectable, Logger } from '@nestjs/common';
import { ProductionNoticeStatus } from '@prisma/client';
import type { Caller } from '../../common/access/caller';
import {
  ConflictException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import type { ProductionNoticesQueryDto } from '../dto';
import {
  PRODUCTION_ERROR,
  type ProductionNoticePage,
  type ProductionNoticeView,
} from '../production.contract';
import { ProductionNoticeDispatcher } from '../notifications/production-notice.dispatcher';
import {
  NOTICE_ORDER_BY,
  NOTICE_VIEW_SELECT,
  noticeListWhere,
  noticeViewOf,
  retryableNoticeWhere,
} from './production-notices.view';
import { pageOf, pagingOf } from './report-views';

/**
 * GET production/admin/notices and POST production/admin/notices/:id/retry.
 * The outbox itself is ProductionNoticeDispatcher's: this service only
 * lists it and puts a row back in its queue.
 */
@Injectable()
export class ProductionNoticesService {
  private readonly logger = new Logger(ProductionNoticesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: ProductionNoticeDispatcher,
  ) {}

  /** Two calls: count + rows with their order code (3 statements). */
  async list(query: ProductionNoticesQueryDto): Promise<ProductionNoticePage> {
    const where = noticeListWhere(query);
    const paging = pagingOf(query);
    const [total, rows] = await Promise.all([
      this.prisma.productionNotice.count({ where }),
      this.prisma.productionNotice.findMany({
        where,
        select: NOTICE_VIEW_SELECT,
        orderBy: NOTICE_ORDER_BY,
        skip: paging.skip,
        take: paging.limit,
      }),
    ]);
    return pageOf(rows.map(noticeViewOf), total, paging);
  }

  /**
   * Put a failed (or fixably skipped) notice back in the queue, due now.
   * ONE conditional write, never read-then-update: the dispatcher's claim
   * could turn the row `sending` in between, and resetting a claimed row
   * would send it twice. `lastError` stays for the history. Two calls on
   * success; a third only to tell 404 from 409 when nothing matched.
   */
  async retry(id: string, caller: Caller): Promise<ProductionNoticeView> {
    const { count } = await this.prisma.productionNotice.updateMany({
      where: { id, ...retryableNoticeWhere() },
      data: {
        status: ProductionNoticeStatus.pending,
        attempts: 0,
        notBefore: new Date(),
      },
    });
    if (count === 0) {
      const exists = await this.prisma.productionNotice.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Notice not found');
      throw new ConflictException(
        'Only a failed notice, or one skipped for a missing setup or address, can be sent again.',
        PRODUCTION_ERROR.NOTICE_NOT_RETRYABLE,
      );
    }

    // Read before the kick, so the answer shows the row as queued rather
    // than whatever state a sweep has already moved it to.
    const row = await this.prisma.productionNotice.findUnique({
      where: { id },
      select: NOTICE_VIEW_SELECT,
    });
    if (!row) throw new NotFoundException('Notice not found');
    this.logger.log(`Notice ${id} queued again by ${caller.userId}`);
    this.kickDispatcher();
    return noticeViewOf(row);
  }

  /** Fire-and-forget: the row is already queued, the 60 s sweep is the fallback. */
  private kickDispatcher(): void {
    try {
      this.dispatcher.kick();
    } catch (error) {
      this.logger.warn(
        `Notice dispatcher kick failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
