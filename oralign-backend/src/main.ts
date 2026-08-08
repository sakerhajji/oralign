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
      // Uploaded media is served from the API origin and rendered by the
      // frontend origin. Disable Helmet's default same-origin CORP header here;
      // /uploads responses set the explicit cross-origin policy below.
      crossOriginResourcePolicy: false,
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

  // Serve uploaded files (avatars, etc.) at /uploads/*.
  //
  // Two things to note:
  //   1. process.cwd() resolves to the container's WORKDIR (/app), so
  //      uploads land at /app/uploads — exactly where docker-compose
  //      mounts the persistent host volume. (We previously also had a
  //      ServeStaticModule.forRoot in app.module.ts with
  //      `rootPath: join(__dirname, '..', 'uploads')` which resolves to
  //      /app/dist/uploads at runtime — a nonexistent path. That second
  //      handler shadowed this one and returned 404 for every avatar.
  //      It has been removed; this is the single source of truth.)
  //   2. Helmet defaults Cross-Origin-Resource-Policy to `same-origin`,
  //      which blocks the frontend at oralign.com.tn from loading
  //      images served by api.oralign.com.tn (different origin). We
  //      explicitly set CORP=cross-origin on /uploads responses so
  //      avatar / clinic-logo / order-file image previews work in the
  //      browser without disabling the protection on the API endpoints
  //      themselves.
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
    setHeaders: (res) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      // SECURITY (audit I-2 / M-9 defence-in-depth): a stored file must
      // never be interpreted as active content. `nosniff` stops MIME
      // guessing; the sandbox CSP means that even if an HTML/SVG file
      // were served here and opened as a document or in an <iframe>, no
      // script runs. These headers do NOT affect <img>/<video> loads, so
      // avatars, logos and media still render normally.
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
      );
    },
  });

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

  // Loopback equivalence: `localhost`, `127.0.0.1` and `[::1]` are the
  // same machine, but CORS matches the Origin STRING — so allowing only
  // http://localhost:3001 silently rejected http://127.0.0.1:3001 and
  // every API call (login included) died in the browser with an opaque
  // network error. Expanding a loopback origin to all three hosts keeps
  // local setups working regardless of which alias the browser uses.
  // Non-loopback origins (real domains in production) pass through
  // untouched, so the production allowlist stays exactly as configured.
  const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
  const expandLoopback = (origin: string): string[] => {
    try {
      const u = new URL(origin);
      if (!LOOPBACK_HOSTS.includes(u.hostname)) return [origin];
      const port = u.port ? `:${u.port}` : '';
      return LOOPBACK_HOSTS.map((host) => `${u.protocol}//${host}${port}`);
    } catch {
      return [origin];
    }
  };
  const allowedOrigins = Array.from(
    new Set([...envOrigins, ...devOrigins].flatMap(expandLoopback)),
  );

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
    exposedHeaders: ['Content-Disposition'],
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
