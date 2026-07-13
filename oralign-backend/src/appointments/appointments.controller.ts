import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import {
  AppointmentsService,
  SlotUnavailableException,
} from './appointments.service';
import { AvailabilityQueryDto, CreateAppointmentDto } from './dto/appointment.dto';

@ApiTags('appointments')
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get('availability/:dentistProfileId')
  @Public()
  @ApiOperation({
    summary: 'Public 30-min slot availability for a listed practitioner.',
  })
  @ApiParam({ name: 'dentistProfileId', type: String })
  @ApiResponse({ status: 200, description: 'Availability grid + nextAvailable.' })
  async getAvailability(
    @Param('dentistProfileId') dentistProfileId: string,
    @Query() query: AvailabilityQueryDto,
  ) {
    return this.appointments.getAvailability(
      dentistProfileId,
      query.from,
      query.days,
    );
  }

  @Post()
  @Public()
  // Public endpoint that emails third parties (the patient + the practitioner).
  // Cap it hard so it can't be used to mail-bomb a victim address or flood a
  // clinic's inbox — 10 requests / hour / IP (mirrors the auth-route limits).
  @Throttle({ long: { limit: 10, ttl: 60 * 60_000 } })
  @ApiOperation({ summary: 'Create a public appointment request.' })
  @ApiResponse({ status: 201, description: 'Appointment created (pending).' })
  @ApiResponse({
    status: 409,
    description: 'Slot no longer available — body carries nextAvailable.',
  })
  async create(
    @Body() dto: CreateAppointmentDto,
    @Res() res: Response,
  ): Promise<Response> {
    try {
      const result = await this.appointments.create(dto);
      return res.status(201).json(result);
    } catch (err) {
      if (err instanceof SlotUnavailableException) {
        return res
          .status(409)
          .json({ message: err.message, nextAvailable: err.nextAvailable });
      }
      // Everything else (404, 400, 500) flows to the global exception filter.
      throw err;
    }
  }

  @Get('action/:token/accept')
  @Public()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'Practitioner accepts a request (from email link).' })
  @ApiParam({ name: 'token', type: String })
  async accept(@Param('token') token: string): Promise<string> {
    return this.appointments.respond(token, 'accepted');
  }

  @Get('action/:token/decline')
  @Public()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'Practitioner declines a request (from email link).' })
  @ApiParam({ name: 'token', type: String })
  async decline(@Param('token') token: string): Promise<string> {
    return this.appointments.respond(token, 'declined');
  }
}
