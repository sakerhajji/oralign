import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  NotificationEvents,
  type TransferReviewOpenedEvent,
} from '../../notifications/events/notification-events';
import { DashboardGateway } from '../gateways/dashboard.gateway';
import { AdminDashboardService } from '../services/admin-dashboard.service';
import { DoctorDashboardService } from '../services/doctor-dashboard.service';

/**
 * Bridges existing domain events (order.*, payment.*, treatmentFee.*,
 * transfer.*, doctor/*, slider.*) to dashboard cache busting + WebSocket
 * broadcasts.
 *
 * The pattern: domain modules emit `<aggregate>.<verb>` events for
 * their own reasons (notifications, audit, etc.). We piggy-back on
 * those — no need for business services to know about dashboards.
 *
 * Each handler does the minimum work: bust the doctor cache, tell
 * the gateway to broadcast. The frontend's React-Query layer
 * dedupes and re-fetches (the admins' sidebar badge and pending desk
 * included: the socket is mounted in the admin sidebar).
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
    if (payload?.doctorId)
      this.gateway.broadcastDoctorInvalidate(payload.doctorId, 'kpis');
  }

  /** Quotation sent / approved / cancelled / recalled. */
  @OnEvent('quotation.*')
  async onQuotationEvent(payload: { doctorId?: string }) {
    await this.admin.invalidateAll();
    if (payload?.doctorId) await this.doctor.invalidateDoctor(payload.doctorId);
    this.gateway.broadcastAdminInvalidate('all');
    if (payload?.doctorId)
      this.gateway.broadcastDoctorInvalidate(payload.doctorId);
  }

  /**
   * Payment received / declared / confirmed / rejected / withdrawn /
   * superseded: the takings, the pending desk and every admin's badge.
   */
  @OnEvent('payment.*')
  async onPaymentEvent(payload: { doctorId?: string }) {
    await this.moneyChanged(payload);
  }

  /**
   * Treatment fee declared / paid / confirmed / rejected / withdrawn /
   * superseded: the same surfaces as an installment payment.
   */
  @OnEvent('treatmentFee.*')
  async onTreatmentFeeEvent(payload: { doctorId?: string }) {
    await this.moneyChanged(payload);
  }

  /**
   * An admin opened a receipt. Only the FIRST opening changes anything
   * global: the "À vérifier" stamp (receipt_sent → to_verify) every
   * admin's desk and payment history show (no figure changed, no cache to
   * bust). A re-opening (firstOpen false) only marks the opener's own row
   * read, and his client refreshes itself, so no admin is told to refetch.
   */
  @OnEvent(NotificationEvents.TransferReviewOpened)
  onTransferReviewOpened(payload: TransferReviewOpenedEvent) {
    if (!payload?.firstOpen) return;
    this.gateway.broadcastAdminInvalidate('all');
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

  /** Money moved (or a transfer left the queue): both sides refetch. */
  private async moneyChanged(payload: { doctorId?: string }): Promise<void> {
    await this.admin.invalidateAll();
    if (payload?.doctorId) await this.doctor.invalidateDoctor(payload.doctorId);
    this.gateway.broadcastAdminInvalidate('all');
    if (payload?.doctorId)
      this.gateway.broadcastDoctorInvalidate(payload.doctorId);
  }
}
