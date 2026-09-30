import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PaymentProvider, PaymentRecordStatus } from '@prisma/client';
import { env } from '../../common/config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { ClicToPayPaymentsService } from './clictopay-payments.service';

/** Let the app finish booting before the first gateway round-trip. */
const BOOT_DELAY_MS = 30_000;
/** Attempts re-checked per sweep, so a backlog never hammers the gateway. */
const BATCH_SIZE = 25;
/** Grace period: an attempt just created or just checked is left alone. */
const MIN_RECHECK_MS = 60_000;

/**
 * The safety net for payments nobody came back to confirm.
 *
 * A customer who pays and then closes the browser never loads the return page,
 * so nothing would ever promote their attempt: the money is taken while the
 * order stays unpaid. The same hole opens whenever the return trip is lost —
 * a crash, a deploy, a dead battery, a network drop.
 *
 * This sweep asks the gateway about every attempt still in flight and hands
 * the answer to the ordinary verification path, which settles it, expires it,
 * or leaves it alone. It adds no new rule about money: it only makes sure the
 * existing verification eventually runs for every attempt.
 *
 * Running several application instances just means the sweep runs several
 * times; settlement is guarded by a row lock and a status check, so a
 * duplicate sweep cannot fulfil an order twice.
 */
@Injectable()
export class ClicToPayReconciliationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ClicToPayReconciliationService.name);
  private bootTimer?: NodeJS.Timeout;
  private sweepTimer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clicToPay: ClicToPayPaymentsService,
  ) {}

  onModuleInit(): void {
    if (!env.clicToPay.configured) return;
    this.bootTimer = setTimeout(() => void this.sweep(), BOOT_DELAY_MS);
    this.bootTimer.unref?.();
    this.sweepTimer = setInterval(
      () => void this.sweep(),
      env.clicToPay.reconcileIntervalMs,
    );
    this.sweepTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.bootTimer) clearTimeout(this.bootTimer);
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  /**
   * Re-check the attempts that have been waiting the longest. Never throws:
   * one unreachable gateway must not take the sweep down with it.
   */
  async sweep(): Promise<void> {
    // A gateway slower than the interval would otherwise stack sweeps.
    if (this.running) return;
    this.running = true;
    try {
      const cutoff = new Date(Date.now() - MIN_RECHECK_MS);
      const waiting = await this.prisma.payment.findMany({
        where: {
          provider: PaymentProvider.clictopay,
          status: { in: [PaymentRecordStatus.pending, PaymentRecordStatus.unknown] },
          createdAt: { lt: cutoff },
          OR: [{ lastProviderCheckAt: null }, { lastProviderCheckAt: { lt: cutoff } }],
        },
        orderBy: { lastProviderCheckAt: { sort: 'asc', nulls: 'first' } },
        take: BATCH_SIZE,
        select: { id: true },
      });

      for (const { id } of waiting) {
        try {
          const session = await this.clicToPay.reconcile(id);
          if (session.status === PaymentRecordStatus.success) {
            // Worth a warning, not a log line: money arrived that the normal
            // return trip never reported.
            this.logger.warn(
              `Reconciliation settled payment ${id}; the customer never returned.`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Reconciliation failed for payment ${id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `ClicToPay reconciliation sweep failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.running = false;
    }
  }
}
