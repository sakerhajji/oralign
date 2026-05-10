import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
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
    StorageModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
