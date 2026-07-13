import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly prisma: PrismaClient;
  private readonly pool: Pool;
  private isConnected = false;

  // ─── Models ───────────────────────────────────────────────────────────────

  get user() {
    return this.prisma.user;
  }

  get dentistProfile() {
    return this.prisma.dentistProfile;
  }

  get workingHours() {
    return this.prisma.workingHours;
  }

  get appointment() {
    return this.prisma.appointment;
  }

  get patient() {
    return this.prisma.patient;
  }

  get dentalOrder() {
    return this.prisma.dentalOrder;
  }

  get orderToothInstruction() {
    return this.prisma.orderToothInstruction;
  }

  get orderFile() {
    return this.prisma.orderFile;
  }

  // ─── Treatment plan models ────────────────────────────────────────────────

  get treatmentPlan() {
    return this.prisma.treatmentPlan;
  }

  get treatmentMessage() {
    return this.prisma.treatmentMessage;
  }

  get treatmentMessageAttachment() {
    return this.prisma.treatmentMessageAttachment;
  }

  /**
   * Per-treatment-plan IPR / stripping entries. Sits in its own table
   * rather than in OrderToothInstruction so write-races between the
   * doctor's order-level instructions and the planner's IPR are
   * structurally impossible (each table has its own unique key).
   */
  get treatmentPlanIpr() {
    return this.prisma.treatmentPlanIpr;
  }

  // ─── Quotation / Devis models ────────────────────────────────────────────

  get quotation() {
    return this.prisma.quotation;
  }

  get companyBillingSettings() {
    return this.prisma.companyBillingSettings;
  }

  // ─── Packs · Installments · Step batches · Payments ──────────────
  // Added in 20260524 alongside the packs/payments migration.

  get pack() {
    return this.prisma.pack;
  }

  get packPrice() {
    return this.prisma.packPrice;
  }

  get quoteInstallment() {
    return this.prisma.quoteInstallment;
  }

  get quoteStepBatch() {
    return this.prisma.quoteStepBatch;
  }

  get payment() {
    return this.prisma.payment;
  }

  get notification() {
    return this.prisma.notification;
  }

  // ─── Support chat ─────────────────────────────────────────────────────────

  get supportConversation() {
    return this.prisma.supportConversation;
  }

  get supportMessage() {
    return this.prisma.supportMessage;
  }

  // ─── Doctor-dashboard slider media ─────────────────────────────────

  get sliderMedia() {
    return this.prisma.sliderMedia;
  }

  // ─── Practitioner blog ─────────────────────────────────────────────

  get blog() {
    return this.prisma.blog;
  }

  get blogImage() {
    return this.prisma.blogImage;
  }

  // ─── Prisma utilities ─────────────────────────────────────────────────────

  /**
   * Access raw Prisma client for transactions and advanced queries.
   * Usage: await this.prisma.$transaction(tx => tx.user.create(...))
   */
  get $transaction() {
    return this.prisma.$transaction.bind(this.prisma);
  }

  // ─── Constructor ──────────────────────────────────────────────────────────

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // A pooled client can emit 'error' asynchronously — the DB drops an
    // idle connection, a network blip, or a query leaves the client in a
    // bad state. A pg Pool with NO 'error' listener re-throws that as an
    // unhandled exception and CRASHES the process. With this handler the
    // broken client is logged and evicted, so the pool self-heals instead
    // of leaking/poisoning connections over a long uptime (which otherwise
    // exhausts the pool → later queries fail with 500s until a restart).
    this.pool.on('error', (err) => {
      this.logger.error(
        `Idle Postgres client error (client evicted from pool): ${err.message}`,
      );
    });

    const adapter = new PrismaPg(this.pool);
    this.prisma = new PrismaClient({
      adapter,
      log: [
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    try {
      await this.prisma.$connect();
      this.isConnected = true;
      this.logger.log('✓ Database connection established');
    } catch (error) {
      this.logger.error('✗ Database connection failed', error);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.isConnected) {
        await this.prisma.$disconnect();
        await this.pool.end();
        this.isConnected = false;
        this.logger.log('✓ Database connection closed');
      }
    } catch (error) {
      this.logger.error('✗ Error closing database connection', error);
      throw error;
    }
  }

  // ─── Health ───────────────────────────────────────────────────────────────

  /**
   * Real ping to the DB — use this in health check endpoints.
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
