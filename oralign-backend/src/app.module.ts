import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { APP_GUARD } from '@nestjs/core';
import { createKeyv } from '@keyv/redis';
import { join } from 'path';
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

    // ─── Rate limiting ──────────────────────────────────────────────────────
    // Three buckets so we can apply different envelopes per endpoint:
    //   short  — anti-burst (10 req / 10s)
    //   medium — normal usage cap (60 req / min)
    //   long   — slow brute-force protection (300 req / hour)
    // Auth endpoints opt-in to stricter @Throttle() overrides.
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 10_000, limit: 10 },
      { name: 'medium', ttl: 60_000, limit: 60 },
      { name: 'long', ttl: 60 * 60_000, limit: 300 },
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

    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
    }),
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
    StorageModule,
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
