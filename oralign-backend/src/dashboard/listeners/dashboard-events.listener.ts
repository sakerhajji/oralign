import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DashboardGateway } from '../gateways/dashboard.gateway';
import { AdminDashboardService } from '../services/admin-dashboard.service';
import { DoctorDashboardService } from '../services/doctor-dashboard.service';

/**
 * Bridges existing domain events (order.*, payment.*, doctor/*,
 * slider.*) to dashboard cache busting + WebSocket broadcasts.
 *
 * The pattern: domain modules emit `<aggregate>.<verb>` events for
 * their own reasons (notifications, audit, etc.). We piggy-back on
 * those — no need for business services to know about dashboards.
 *
 * Each handler does the minimum work: bust the doctor cache, tell
 * the gateway to broadcast. The frontend's React-Query layer
 * dedupes and re-fetches.
 */
@Injectable()
export class DashboardEventsListener {
  private readonly logger = new Logger(DashboardEventsListener.name);

  constructor(
    private readonly admin: AdminDashboardService,
    private readonly doctor: DoctorDashboardService,
    private readonly gateway: DashboardGateway,
  ) {}

  /** Order created / submitted / status changed → both sides invalidate. */
  @OnEvent('order.*')
  async onOrderEvent(payload: { doctorId?: string }) {
    await this.admin.invalidateAll();
    if (payload?.doctorId) await this.doctor.invalidateDoctor(payload.doctorId);
    this.gateway.broadcastAdminInvalidate('kpis');
    if (payload?.doctorId) this.gateway.broadcastDoctorInvalidate(payload.doctorId, 'kpis');
  }

  /** Quotation sent / approved / cancelled / recalled. */
  @OnEvent('quotation.*')
  async onQuotationEvent(payload: { doctorId?: string }) {
    await this.admin.invalidateAll();
    if (payload?.doctorId) await this.doctor.invalidateDoctor(payload.doctorId);
    this.gateway.broadcastAdminInvalidate('all');
    if (payload?.doctorId) this.gateway.broadcastDoctorInvalidate(payload.doctorId);
  }

  /** Payment received / declared / confirmed / rejected. */
  @OnEvent('payment.*')
  async onPaymentEvent(payload: { doctorId?: string }) {
    await this.admin.invalidateAll();
    if (payload?.doctorId) await this.doctor.invalidateDoctor(payload.doctorId);
    this.gateway.broadcastAdminInvalidate('all');
    if (payload?.doctorId) this.gateway.broadcastDoctorInvalidate(payload.doctorId);
  }

  /** New doctor / patient registration. */
  @OnEvent('user.registered')
  async onUserRegistered() {
    await this.admin.invalidateAll();
    this.gateway.broadcastAdminInvalidate('kpis');
  }

  /** Batch delivery — affects doctor pack usage view. */
  @OnEvent('batch.*')
  async onBatchEvent(payload: { doctorId?: string }) {
    if (payload?.doctorId) {
      await this.doctor.invalidateDoctor(payload.doctorId);
      this.gateway.broadcastDoctorInvalidate(payload.doctorId, 'kpis');
    }
  }

  /** Slider media added / edited / reordered. */
  @OnEvent('slider.changed')
  onSliderChanged() {
    this.gateway.broadcastSliderChanged();
  }
}
