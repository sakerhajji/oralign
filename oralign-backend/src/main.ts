import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/exceptions/exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Serve uploaded files (avatars, etc.) at /uploads/*
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: [
      process.env.FRONTEND_URL || 'http://localhost:3001',
      'http://localhost:3001',
      'http://localhost:3000',
      'http://localhost:5173',
    ],
    credentials: true,
  });

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('Oralign API')
    .setDescription(
      '## Complete NestJS API for Dentist Clinic Management\n\n' +
        'This API provides a comprehensive backend solution for managing dentist profiles, appointments, and clinic operations. ' +
        'It is built with NestJS, Prisma, and follows Clean Architecture principles for a scalable and maintainable codebase.\n\n' +
        '### Key Features:\n' +
        '- **Authentication**: Secure JWT-based authentication (access and refresh tokens).\n' +
        '- **User Management**: Role-based access control for users.\n' +
        '- **Dentist Profiles**: Full CRUD operations for dentist profiles, including search by location.\n' +
        '- **Working Hours**: Manage clinic operating hours.\n' +
        '- **Error Handling**: Centralized exception handling for consistent error responses.\n\n' +
        '### Authentication Flow:\n' +
        '1. **Sign Up**: Register a new account using `POST /auth/signup`.\n' +
        '2. **Sign In**: Log in with your credentials using `POST /auth/signin` to receive an `access-token` and `refresh-token`.\n' +
        '3. **Authorized Requests**: Include the `access-token` in the `Authorization` header for all protected endpoints (e.g., `Authorization: Bearer <token>`).\n' +
        '4. **Token Refresh**: When the `access-token` expires, use the `refresh-token` with `POST /auth/refresh` to get a new set of tokens.\n',
    )
    .setVersion('1.0.0')
    .setContact(
      'API Support',
      'https://oralign.com/support',
      'support@oralign.com',
    )
    .setLicense('MIT License', 'https://opensource.org/licenses/MIT')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter JWT access token',
        in: 'header',
      },
      'access-token', // This name here is important for matching up with @ApiBearerAuth() in your controllers
    )
    .addTag(
      'Authentication',
      'Endpoints for user sign-up, sign-in, and token management',
    )
    .addTag('Users', 'Endpoints for managing user accounts and profiles')
    .addTag(
      'Dentist Profile',
      'Endpoints for creating, updating, and searching for dentist profiles',
    )
    .addTag('Patients', 'Endpoints for managing dentist patients')
    .addTag('Orders', 'Endpoints for managing dental aligner orders')
    .addTag('Working Hours', 'Endpoints for managing clinic working hours')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const httpPort = parseInt(process.env.HTTP_PORT || '3000', 10);
  await app.listen(httpPort, () => {
    console.log(`\n🚀 Server running on http://localhost:${httpPort}`);
    console.log(`📖 API Docs: http://localhost:${httpPort}/docs\n`);
  });
}
void bootstrap().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
