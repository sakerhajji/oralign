import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  OnModuleInit,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeController, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  MockForceInstallmentAvailableDto,
  MockSimulateCallbackDto,
} from '../dto/payment.dto';
import { PaymentsService } from '../services/payments.service';

/**
 * DEV-ONLY — DO NOT DEPLOY.
 *
 * Endpoints under `/dev` exist solely so QA + integration tests can
 * exercise the async-callback + force-availability code paths without
 * waiting for real time / a real gateway. Three layers of protection
 * keep them out of production:
 *
 *   1. OnModuleInit throws if NODE_ENV === 'production' so the
 *      container refuses to boot with these endpoints active.
 *   2. Every handler re-asserts NODE_ENV inside its body — defense in
 *      depth in case a test sets the guard but forgets the env.
 *   3. @ApiExcludeController hides them from the OpenAPI / Swagger
 *      schema served by the production build.
 */
@ApiTags('dev')
@ApiBearerAuth('access-token')
@ApiExcludeController()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin, UserRole.super_admin)
@Controller('dev')
export class DevController implements OnModuleInit {
  constructor(private readonly payments: PaymentsService) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'DevController must not be registered in production. ' +
          'Check that the module is conditionally imported.',
      );
    }
  }

  @Post('mock-force-installment-available')
  @HttpCode(HttpStatus.OK)
  async forceAvailable(
    @Body() dto: MockForceInstallmentAvailableDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Dev endpoint disabled in production.');
    }
    return this.payments.devForceInstallmentAvailable({
      installmentId: dto.installmentId,
      actor: { userId: user.sub, role: user.role as UserRole },
    });
  }

  @Post('mock-simulate-callback')
  @HttpCode(HttpStatus.OK)
  async simulateCallback(
    @Body() dto: MockSimulateCallbackDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Dev endpoint disabled in production.');
    }
    return this.payments.devSimulateCallback({
      paymentId: dto.paymentId,
      status: dto.status,
      actor: { userId: user.sub, role: user.role as UserRole },
    });
  }
}
