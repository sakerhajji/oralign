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
