import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './services/auth.service';
import { AuthController } from './controllers/auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PrismaModule } from '../prisma/prisma.module';
import { requiredSecret } from '../common/config/required-secret';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.register({
      // Required in production — see requiredSecret for the rules.
      secret: requiredSecret('JWT_SECRET'),
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
