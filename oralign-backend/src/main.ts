import 'dotenv/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/exceptions/exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Quieter built-in logger — we still emit our own startup banner below.
    bufferLogs: true,
  });
  const logger = new Logger('Bootstrap');
  const isProd = process.env.NODE_ENV === 'production';

  // ─── HTTP hardening ───────────────────────────────────────────────────────

  // Behind nginx in production — trust the first reverse proxy so rate-limit,
  // logs, and req.ip resolve to the real client address.
  app.set('trust proxy', 1);

  // Security headers (CSP/HSTS/XFO/Referrer/etc). Conservative defaults: we
  // disable CSP for now because Swagger UI ships inline scripts/styles and a
  // CSP needs careful tuning per-route. Everything else stays on.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      // HSTS only meaningful when served over HTTPS — nginx terminates TLS.
      hsts: isProd
        ? { maxAge: 60 * 60 * 24 * 365, includeSubDomains: true, preload: true }
        : false,
    }),
  );

  // Body size cap — JSON requests should stay small; large uploads go through
  // Multer which has its own limits. 1 MB is plenty for JSON DTOs.
  app.use(
    (await import('express')).json({ limit: '1mb' }),
    (await import('express')).urlencoded({ extended: true, limit: '1mb' }),
  );

  // Serve uploaded files (avatars, etc.) at /uploads/*
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  app.setGlobalPrefix('api');

  // ─── CORS allowlist ───────────────────────────────────────────────────────
  // Production must whitelist explicit origins from env. Dev includes loopback
  // ports as a convenience. We deliberately do NOT fall through to '*' or
  // accept any origin when env vars are missing.
  const envOrigins = (
    process.env.CORS_ORIGINS ??
    process.env.FRONTEND_URL ??
    ''
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const devOrigins = isProd
    ? []
    : [
        'http://localhost:3001',
        'http://localhost:3000',
        'http://localhost:5173',
      ];
  const allowedOrigins = Array.from(new Set([...envOrigins, ...devOrigins]));

  if (allowedOrigins.length === 0 && isProd) {
    throw new Error(
      '[security] CORS_ORIGINS or FRONTEND_URL must be set in production',
    );
  }

  app.enableCors({
    origin: (origin, callback) => {
      // Server-to-server / curl / health-check requests have no Origin —
      // allow them. Browser-origins must match the allowlist exactly.
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin ${origin} is not allowed`));
    },
    credentials: true,
    maxAge: 600,
  });

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global validation pipe — strict by default to defend against
  // mass-assignment and unexpected payload shapes.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ─── Swagger ───────────────────────────────────────────────────────────────
  // Public docs are useful in dev/staging but a needless attack surface in
  // production. Disable unless ENABLE_SWAGGER=true is explicitly set.
  const enableSwagger = !isProd || process.env.ENABLE_SWAGGER === 'true';
  if (enableSwagger) {
    const config = new DocumentBuilder()
      .setTitle('Oralign API')
      .setDescription('Oralign clinic-management REST API')
      .setVersion('1.0.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          description: 'Enter JWT access token',
          in: 'header',
        },
        'access-token',
      )
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  const httpPort = parseInt(process.env.HTTP_PORT || '3000', 10);
  await app.listen(httpPort);
  logger.log(
    `Listening on :${httpPort} (NODE_ENV=${process.env.NODE_ENV ?? 'unset'})`,
  );
  if (enableSwagger) {
    logger.log(`Swagger docs: /docs`);
  }
}
void bootstrap().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
