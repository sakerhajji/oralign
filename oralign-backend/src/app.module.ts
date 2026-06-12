import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_GUARD } from '@nestjs/core';
import { createKeyv } from '@keyv/redis';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DentistProfileModule } from './dentist-profile/dentist-profile.module';
import { WorkingHoursModule } from './working-hours/working-hours.module';
import { StorageModule } from './storage/storage.module';
import { MailModule } from './mail/mail.module';
import { PatientModule } from './patients/patient.module';
import { OrderModule } from './orders/order.module';
import { TreatmentPlanModule } from './treatment-plans/treatment-plan.module';
import { PackModule } from './packs/pack.module';
import { QuotationModule } from './quotations/quotation.module';
import { PaymentsModule } from './payments/payments.module';
import { InvoicesModule } from './invoices/invoices.module';
import { NotificationsModule } from './notifications/notification.module';
import { SupportModule } from './support/support.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SliderMediaModule } from './slider-media/slider-media.module';
import { ReportsModule } from './reports/reports.module';
import { MediaModule } from './media/media.module';

// ─── Redis URL builder ──────────────────────────────────────────────────────
// Compose injects REDIS_HOST / REDIS_PORT / REDIS_PASSWORD individually; this
// helper assembles a connection URL the @keyv/redis client understands.
function buildRedisUrl(): string {
  const host = process.env.REDIS_HOST ?? '127.0.0.1';
  const port = process.env.REDIS_PORT ?? '6379';
  const password = process.env.REDIS_PASSWORD ?? '';
  const auth = password ? `:${encodeURIComponent(password)}@` : '';
  return `redis://${auth}${host}:${port}`;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // ─── Event bus (in-process, in-memory) ─────────────────────────────────
    // Powers the decoupled notification pipeline: business services emit
    // domain events (`user.registered`, `payment.confirmed`, …) and the
    // NotificationsListener materialises them into Notification rows.
    // We don't need cross-process delivery — a single Nest instance owns
    // the bus and the writes are committed before any listener runs.
    EventEmitterModule.forRoot({
      wildcard: true,         // allow listener globs like `payment.*` later
      delimiter: '.',
      maxListeners: 50,
      verboseMemoryLeak: false,
    }),

    // ─── Rate limiting ──────────────────────────────────────────────────────
    // Three buckets so we can apply different envelopes per endpoint:
    //   short  — anti-burst (30 req / 10 s)  — generous because the
    //            dashboard fires many parallel requests on first paint
    //   medium — normal usage cap (120 req / min)
    //   long   — slow brute-force protection (1000 req / hour)
    // Auth endpoints layer on stricter @Throttle() overrides; file
    // downloads use @SkipThrottle() (already RBAC-gated).
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 10_000, limit: 30 },
      { name: 'medium', ttl: 60_000, limit: 120 },
      { name: 'long', ttl: 60 * 60_000, limit: 1000 },
    ]),

    // ─── Distributed cache (Redis) ──────────────────────────────────────────
    // Backed by @keyv/redis through cache-manager v6. TTLs are set
    // per-call by services; this is just the global store.
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: () => ({
        stores: [createKeyv(buildRedisUrl())],
        // 5-minute default — most callers override with explicit TTL anyway.
        ttl: 5 * 60_000,
      }),
    }),

    // ─── Static files ─────────────────────────────────────────────────────
    // /uploads/* is served via `app.useStaticAssets(...)` in main.ts —
    // see comments there. We deliberately do NOT mount a second
    // ServeStaticModule here: the previous attempt used
    //   rootPath: join(__dirname, '..', 'uploads')
    // which at runtime resolves to /app/dist/uploads (because the
    // compiled entry-point lives at /app/dist/src/main.js) — a path
    // that does NOT exist. The Docker volume mounts the host uploads
    // dir at /app/uploads, which is what useStaticAssets + process.cwd()
    // resolves to. Two handlers for the same prefix is also a footgun:
    // depending on registration order the wrong one shadows the correct
    // one and every avatar URL returns 404.
    PrismaModule,
    CommonModule,
    MailModule,
    AuthModule,
    UsersModule,
    DentistProfileModule,
    WorkingHoursModule,
    PatientModule,
    OrderModule,
    TreatmentPlanModule,
    QuotationModule,
    PackModule,
    PaymentsModule,
    InvoicesModule,
    NotificationsModule,
    SupportModule,
    SliderMediaModule,
    DashboardModule,
    ReportsModule,
    StorageModule,
    MediaModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // ThrottlerGuard runs before every request — auth endpoints layer on
    // @Throttle({...}) for stricter per-route ceilings.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
