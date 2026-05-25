import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminDashboardController } from './controllers/admin-dashboard.controller';
import { DoctorDashboardController } from './controllers/doctor-dashboard.controller';
import { DashboardGateway } from './gateways/dashboard.gateway';
import { DashboardEventsListener } from './listeners/dashboard-events.listener';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { DoctorDashboardService } from './services/doctor-dashboard.service';

/**
 * Dashboard module — admin + doctor KPI aggregates + WebSocket
 * push-invalidation. Read-heavy; every aggregate is cached in Redis
 * (60 s admin, 30 s doctor) and busted from the events listener.
 */
@Module({
  imports: [PrismaModule],
  controllers: [AdminDashboardController, DoctorDashboardController],
  providers: [
    AdminDashboardService,
    DoctorDashboardService,
    DashboardGateway,
    DashboardEventsListener,
  ],
  exports: [AdminDashboardService, DoctorDashboardService, DashboardGateway],
})
export class DashboardModule {}
