import { Injectable, Logger, StreamableFile } from '@nestjs/common';
import {
  OrderFile,
  OrderFileCategory,
  OrderStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { PaginatedResponse } from '../../common/dto/response.dto';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import { OrderNotificationService } from '../../mail/order-notification.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateOrderDto,
  OrderFileResponseDto,
  OrderFilterDto,
  OrderResponseDto,
  ToothInstructionDto,
  UpdateOrderDto,
} from '../dto/order.dto';

type Caller = { userId: string; role: UserRole | string };

const orderInclude = Prisma.validator<Prisma.DentalOrderInclude>()({
  doctor: { select: { id: true, fullName: true, email: true } },
  patient: { select: { id: true, fullName: true, email: true, phone: true } },
  toothInstructions: {
    select: { toothNumber: true, type: true },
    orderBy: [{ toothNumber: 'asc' }, { type: 'asc' }],
  },
  files: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
  },
  // Used to compute notification badges in the orders list. `take: 1` keeps
  // the join tiny — Postgres only fetches one row per order, so this scales
  // with page size, not with plan-history size.
  treatmentPlans: {
    where: { deletedAt: null },
    select: { id: true, status: true },
    orderBy: { version: 'desc' },
    take: 1,
  },
  _count: {
    select: {
      treatmentPlans: { where: { deletedAt: null } },
    },
  },
});

type OrderWithRelations = Prisma.DentalOrderGetPayload<{
  include: typeof orderInclude;
}>;

type ClinicalOrderData = Partial<
  Pick<
    Prisma.DentalOrderUncheckedCreateInput,
    | 'patientStage'
    | 'chiefComplaint'
    | 'archTreatment'
    | 'treatBothArch'
    | 'treatmentPlan'
    | 'dontMoveOption'
    | 'apRelationship'
    | 'anteroposteriorRelationship'
    | 'elastics'
    | 'openBite'
    | 'midline'
    | 'ipr'
    | 'biteRamps'
    | 'expansion'
    | 'crossbite'
    | 'spaces'
    | 'extractions'
    | 'specialInstructions'
    | 'additionalInstructions'
    | 'useCbctWithScans'
    | 'wantsManufacturing'
    | 'materials'
  >
>;

const ADMIN_ROLES: string[] = [UserRole.admin, UserRole.super_admin];
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');
const ALLOWED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.heic',
  '.mp4',
  '.mov',
  '.avi',
  '.stl',
  '.ply',
  '.obj',
  '.zip',
  '.pdf',
]);

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: OrderNotificationService,
  ) {}

  readonly includeOrder = orderInclude;

  async createOrder(
    createOrderDto: CreateOrderDto,
    caller: Caller,
  ): Promise<OrderResponseDto> {
    this.ensureCanCreateOrModify(caller);

    const doctorId = ADMIN_ROLES.includes(caller.role)
      ? createOrderDto.doctorId
      : caller.userId;

    if (!doctorId) {
      throw new BadRequestException('Dentist is required');
    }

    await this.ensureDentistExists(doctorId);
    await this.ensurePatientBelongsToDoctor(createOrderDto.patientId, doctorId);
    this.ensureUniqueToothInstructions(createOrderDto.toothInstructions ?? []);

    const order = await this.prisma.dentalOrder.create({
      data: {
        ...this.buildClinicalData(createOrderDto),
        orderCode: createOrderDto.orderCode ?? (await this.generateOrderCode()),
        doctorId,
        patientId: createOrderDto.patientId,
        toothInstructions: createOrderDto.toothInstructions?.length
          ? {
              create: createOrderDto.toothInstructions.map((instruction) => ({
                toothNumber: instruction.toothNumber,
                type: instruction.type,
              })),
            }
          : undefined,
      },
      include: this.includeOrder,
    });

    return this.mapToDto(order);
  }

  async getOrders(
    page = 1,
    limit = 10,
    filters: OrderFilterDto,
    caller: Caller,
  ): Promise<PaginatedResponse<OrderResponseDto>> {
    const take = Math.min(Math.max(limit, 1), 100);
    const currentPage = Math.max(page, 1);
    const skip = (currentPage - 1) * take;
    const where = this.buildWhere(filters, caller);

    const [orders, total] = await Promise.all([
      this.prisma.dentalOrder.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: this.includeOrder,
      }),
      this.prisma.dentalOrder.count({ where }),
    ]);

    return new PaginatedResponse(
      orders.map((order) => this.mapToDto(order)),
      total,
      currentPage,
      take,
      Math.ceil(total / take),
    );
  }

  async getOrderById(id: string, caller: Caller): Promise<OrderResponseDto> {
    const order = await this.findAccessibleOrder(id, caller);
    return this.mapToDto(order);
  }

  async updateOrder(
    id: string,
    updateOrderDto: UpdateOrderDto,
    caller: Caller,
  ): Promise<OrderResponseDto> {
    this.ensureCanCreateOrModify(caller);
    const current = await this.findAccessibleOrder(id, caller);

    const doctorId = ADMIN_ROLES.includes(caller.role)
      ? updateOrderDto.doctorId
      : current.doctorId;
    const patientId = updateOrderDto.patientId ?? current.patientId;

    if (doctorId) {
      await this.ensureDentistExists(doctorId);
    }
    await this.ensurePatientBelongsToDoctor(
      patientId,
      doctorId ?? current.doctorId,
    );

    const order = await this.prisma.dentalOrder.update({
      where: { id },
      data: {
        ...this.buildClinicalData(updateOrderDto),
        ...(ADMIN_ROLES.includes(caller.role) && doctorId ? { doctorId } : {}),
        patientId,
        ...(updateOrderDto.orderCode
          ? { orderCode: updateOrderDto.orderCode }
          : {}),
      },
      include: this.includeOrder,
    });

    return this.mapToDto(order);
  }

  async deleteOrder(id: string, caller: Caller): Promise<{ message: string }> {
    this.ensureCanCreateOrModify(caller);
    await this.findAccessibleOrder(id, caller);

    await this.prisma.dentalOrder.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { message: 'Order deleted successfully' };
  }

  async permanentDeleteOrder(
    id: string,
    caller: Caller,
  ): Promise<{ message: string }> {
    this.ensureCanPermanentDelete(caller);

    const order = await this.prisma.dentalOrder.findFirst({
      where: { id },
      select: {
        id: true,
        files: { select: { relativePath: true } },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.orderToothInstruction.deleteMany({ where: { orderId: id } });
      await tx.orderFile.deleteMany({ where: { orderId: id } });
      await tx.dentalOrder.delete({ where: { id } });
    });

    await Promise.all(
      order.files.map((file) => this.removeFileFromDisk(file.relativePath)),
    );

    return { message: 'Order permanently deleted successfully' };
  }

  async submitOrder(id: string, caller: Caller): Promise<OrderResponseDto> {
    this.ensureCanCreateOrModify(caller);
    const current = await this.findAccessibleOrder(id, caller);

    if (current.status !== OrderStatus.draft) {
      throw new BadRequestException('Only draft orders can be submitted');
    }

    const order = await this.prisma.dentalOrder.update({
      where: { id },
      data: { status: OrderStatus.submitted, submittedAt: new Date() },
      include: this.includeOrder,
    });

    // Fire-and-forget — fan-out emails to doctor + all admins. Failures
    // are logged inside the notification service so a flaky SMTP relay
    // can't break the submit-order transaction the user is waiting on.
    void this.notifications.notifyOrderSubmitted(order.id);

    return this.mapToDto(order);
  }

  /**
   * Admin-only manual status override.
   *
   * Sets `order.status` to any valid OrderStatus value, no state-machine
   * validation — the admin is intentionally allowed to roll forward
   * (skip ahead) OR roll backward (undo a transition that fired by
   * mistake). Related side-tables (treatment plan, quotation) are NOT
   * touched: changing the status doesn't destroy artefacts.
   *
   * The reason field is logged at INFO level for traceability; an
   * audit-log table is a follow-up feature.
   */
  async overrideStatus(
    id: string,
    status: OrderStatus,
    reason: string | undefined,
    caller: Caller,
  ): Promise<OrderResponseDto> {
    if (!ADMIN_ROLES.includes(caller.role)) {
      throw new ForbiddenException(
        'Only admins can manually override an order status.',
      );
    }
    const current = await this.findAccessibleOrder(id, caller);

    if (current.status === status) {
      // Idempotent — no-op when the requested status matches reality.
      return this.mapToDto(current);
    }

    this.logger.log(
      `Admin status override on order ${current.orderCode} (${id}): ` +
        `${current.status} → ${status}` +
        ` by user ${caller.userId}` +
        (reason ? ` — reason: ${reason}` : ''),
    );

    // When admin rolls all the way back to `draft`, clear the
    // submittedAt timestamp so the order looks pristine again. When
    // admin moves a still-unsubmitted draft forward, backfill
    // submittedAt now so downstream UIs that key off it (e.g. "Created
    // / Submitted" header strap) stay consistent.
    const data: Prisma.DentalOrderUncheckedUpdateInput = { status };
    if (status === OrderStatus.draft) {
      data.submittedAt = null;
    } else if (!current.submittedAt) {
      data.submittedAt = new Date();
    }

    const order = await this.prisma.dentalOrder.update({
      where: { id },
      data,
      include: this.includeOrder,
    });

    return this.mapToDto(order);
  }

  async updateToothInstructions(
    id: string,
    instructions: ToothInstructionDto[],
    caller: Caller,
  ): Promise<OrderResponseDto> {
    // Designers normally can't modify orders directly, but the odontogram
    // (and especially per-tooth IPR values) IS their job in the treatment
    // plan editor. assertCanEditOdontogram allows them when assigned.
    this.ensureCanEditOdontogram(caller);
    await this.findAccessibleOrder(id, caller);

    this.ensureUniqueToothInstructions(instructions);

    // Defence-in-depth dedupe: even after the per-payload uniqueness
    // check above passes, two CONCURRENT updateToothInstructions calls
    // for the same order can race each other (both pass the check
    // independently, then their createMany overlap and one fails the
    // unique constraint with P2002). The SELECT FOR UPDATE below
    // serialises that race; dedupe via Map here is also a belt to
    // catch any frontend bug that sends the same (tooth, type) twice
    // in one payload before it reaches the DB.
    const deduped = new Map<string, ToothInstructionDto>();
    for (const ins of instructions) {
      deduped.set(`${ins.toothNumber}:${ins.type}`, ins);
    }
    const uniqueInstructions = Array.from(deduped.values());

    const order = await this.prisma.$transaction(async (tx) => {
      // Row-level lock on the parent order. Two concurrent calls for
      // the same orderId serialise here, eliminating the delete +
      // createMany race that otherwise throws P2002.
      await tx.$queryRaw`SELECT id FROM "DentalOrder" WHERE id = ${id}::uuid FOR UPDATE`;

      await tx.orderToothInstruction.deleteMany({ where: { orderId: id } });
      if (uniqueInstructions.length > 0) {
        await tx.orderToothInstruction.createMany({
          data: uniqueInstructions.map((instruction) => ({
            orderId: id,
            toothNumber: instruction.toothNumber,
            type: instruction.type,
            // value/note are optional; ipr_value entries use value as the
            // measured IPR amount in mm and note as the optional
            // stripping auxiliary value. The DTO validated shape.
            value: instruction.value ?? null,
            note: instruction.note ?? null,
            createdById: caller.userId,
          })),
        });
      }

      return tx.dentalOrder.findUniqueOrThrow({
        where: { id },
        include: this.includeOrder,
      });
    });

    return this.mapToDto(order);
  }

  async uploadFiles(
    id: string,
    files: Express.Multer.File[],
    category: OrderFileCategory,
    caller: Caller,
  ): Promise<OrderFileResponseDto[]> {
    this.ensureCanCreateOrModify(caller);
    await this.findAccessibleOrder(id, caller);

    if (!files?.length) {
      throw new BadRequestException('No files uploaded');
    }

    const savedFiles: Prisma.OrderFileCreateManyInput[] = [];

    for (const file of files) {
      this.validateFile(file);
      const saved = await this.saveFileToDisk(id, category, file);
      savedFiles.push(saved);
    }

    await this.prisma.orderFile.createMany({ data: savedFiles });

    const orderFiles = await this.prisma.orderFile.findMany({
      where: {
        orderId: id,
        deletedAt: null,
        relativePath: { in: savedFiles.map((file) => file.relativePath) },
      },
      orderBy: { createdAt: 'desc' },
    });

    return orderFiles.map((file) => this.mapFileToDto(file));
  }

  async getFiles(id: string, caller: Caller): Promise<OrderFileResponseDto[]> {
    await this.findAccessibleOrder(id, caller);

    const files = await this.prisma.orderFile.findMany({
      where: { orderId: id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    return files.map((file) => this.mapFileToDto(file));
  }

  async deleteFile(
    id: string,
    fileId: string,
    caller: Caller,
  ): Promise<{ message: string }> {
    this.ensureCanCreateOrModify(caller);
    await this.findAccessibleOrder(id, caller);
    const file = await this.findOrderFile(id, fileId);

    await this.prisma.orderFile.update({
      where: { id: file.id },
      data: { deletedAt: new Date() },
    });

    await this.removeFileFromDisk(file.relativePath);

    return { message: 'Order file deleted successfully' };
  }

  async getDownloadFile(
    id: string,
    fileId: string,
    caller: Caller,
  ): Promise<{
    stream: StreamableFile;
    file: OrderFile;
    absolutePath: string;
  }> {
    await this.findAccessibleOrder(id, caller);
    const file = await this.findOrderFile(id, fileId);
    const absolutePath = this.resolveUploadPath(file.relativePath);

    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException('Stored file not found');
    }

    return {
      stream: new StreamableFile(fs.createReadStream(absolutePath)),
      file,
      absolutePath,
    };
  }

  private buildWhere(
    filters: OrderFilterDto,
    caller: Caller,
  ): Prisma.DentalOrderWhereInput {
    const where: Prisma.DentalOrderWhereInput = { deletedAt: null };

    if (ADMIN_ROLES.includes(caller.role)) {
      if (filters.doctorId) where.doctorId = filters.doctorId;
    } else if (caller.role === UserRole.dentist) {
      where.doctorId = caller.userId;
    } else if (caller.role === UserRole.designer) {
      where.assignedDesignerId = caller.userId;
    } else {
      throw new ForbiddenException('You cannot view orders');
    }

    if (filters.patientId) where.patientId = filters.patientId;
    if (filters.status) where.status = filters.status;
    if (filters.orderCode) {
      where.orderCode = { contains: filters.orderCode, mode: 'insensitive' };
    }
    if (filters.search) {
      where.OR = [
        { orderCode: { contains: filters.search, mode: 'insensitive' } },
        {
          patient: {
            fullName: { contains: filters.search, mode: 'insensitive' },
          },
        },
        {
          doctor: {
            fullName: { contains: filters.search, mode: 'insensitive' },
          },
        },
      ];
    }

    return where;
  }

  private async findAccessibleOrder(
    id: string,
    caller: Caller,
  ): Promise<OrderWithRelations> {
    const order = await this.prisma.dentalOrder.findFirst({
      where: {
        id,
        deletedAt: null,
        ...this.accessWhere(caller),
      },
      include: this.includeOrder,
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  private accessWhere(caller: Caller): Prisma.DentalOrderWhereInput {
    if (ADMIN_ROLES.includes(caller.role)) return {};
    if (caller.role === UserRole.dentist) return { doctorId: caller.userId };
    if (caller.role === UserRole.designer) {
      return { assignedDesignerId: caller.userId };
    }
    throw new ForbiddenException('You cannot access orders');
  }

  private ensureCanCreateOrModify(caller: Caller): void {
    if (caller.role === UserRole.designer) {
      throw new ForbiddenException('Designers cannot modify orders directly');
    }
    if (
      caller.role !== UserRole.dentist &&
      !ADMIN_ROLES.includes(caller.role)
    ) {
      throw new ForbiddenException('You cannot manage orders');
    }
  }

  /**
   * Looser permission gate used by the per-tooth instruction endpoint —
   * lets designers update the odontogram (color flags + IPR mm values)
   * because that's their primary job during treatment planning. Read
   * access (assertOrderReadable) is enforced separately and ensures the
   * caller is actually assigned to this order.
   */
  private ensureCanEditOdontogram(caller: Caller): void {
    if (
      caller.role !== UserRole.dentist &&
      caller.role !== UserRole.designer &&
      !ADMIN_ROLES.includes(caller.role)
    ) {
      throw new ForbiddenException('You cannot edit this odontogram');
    }
  }

  private ensureCanPermanentDelete(caller: Caller): void {
    if (!ADMIN_ROLES.includes(caller.role)) {
      throw new ForbiddenException('Only admins can permanently delete orders');
    }
  }

  private async ensureDentistExists(doctorId: string): Promise<void> {
    const dentist = await this.prisma.user.findFirst({
      where: { id: doctorId, role: UserRole.dentist, deletedAt: null },
      select: { id: true },
    });

    if (!dentist) {
      throw new NotFoundException('Dentist not found');
    }
  }

  private async ensurePatientBelongsToDoctor(
    patientId: string,
    doctorId: string,
  ): Promise<void> {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, doctorId, deletedAt: null },
      select: { id: true },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found for this dentist');
    }
  }

  private ensureUniqueToothInstructions(
    instructions: ToothInstructionDto[],
  ): void {
    const seen = new Set<string>();
    for (const instruction of instructions) {
      const key = `${instruction.toothNumber}:${instruction.type}`;
      if (seen.has(key)) {
        throw new BadRequestException(
          'Duplicate tooth instruction for the same tooth',
        );
      }
      seen.add(key);
    }
  }

  private buildClinicalData(
    dto: Partial<CreateOrderDto | UpdateOrderDto>,
  ): ClinicalOrderData {
    return {
      patientStage: dto.patientStage,
      chiefComplaint: dto.chiefComplaint,
      archTreatment: dto.archTreatment,
      treatBothArch: dto.treatBothArch,
      treatmentPlan: dto.treatmentPlan,
      dontMoveOption: dto.dontMoveOption,
      apRelationship: dto.apRelationship,
      anteroposteriorRelationship: dto.anteroposteriorRelationship,
      elastics: dto.elastics,
      openBite: dto.openBite,
      midline: dto.midline,
      ipr: dto.ipr,
      biteRamps: dto.biteRamps,
      expansion: dto.expansion,
      crossbite: dto.crossbite,
      spaces: dto.spaces,
      extractions: dto.extractions,
      specialInstructions: dto.specialInstructions,
      additionalInstructions: dto.additionalInstructions,
      useCbctWithScans: dto.useCbctWithScans,
      wantsManufacturing: dto.wantsManufacturing,
      materials: dto.materials,
    };
  }

  private async generateOrderCode(): Promise<string> {
    const date = new Date();
    const stamp = date.toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.prisma.dentalOrder.count({
      where: {
        createdAt: {
          gte: new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`),
        },
      },
    });
    return `ORD-${stamp}-${String(count + 1).padStart(4, '0')}`;
  }

  private validateFile(file: Express.Multer.File): void {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('File size must be 50MB or less');
    }

    const extension = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      throw new BadRequestException('File extension is not allowed');
    }

    if (file.originalname.includes('..') || /[\\/]/.test(file.originalname)) {
      throw new BadRequestException('Invalid file name');
    }
  }

  private async saveFileToDisk(
    orderId: string,
    category: OrderFileCategory,
    file: Express.Multer.File,
  ): Promise<Prisma.OrderFileCreateManyInput> {
    const safeBase = path
      .basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .slice(0, 80);
    const ext = path.extname(file.originalname).toLowerCase();
    const fileName = `${safeBase || 'file'}-${uuidv4()}${ext}`;
    const relativePath = path.posix.join('orders', orderId, category, fileName);
    const absolutePath = this.resolveUploadPath(relativePath);

    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.promises.writeFile(absolutePath, file.buffer);

    return {
      orderId,
      category,
      originalName: file.originalname,
      fileName,
      relativePath,
      mimeType: file.mimetype || 'application/octet-stream',
      size: file.size,
    };
  }

  private async removeFileFromDisk(relativePath: string): Promise<void> {
    const absolutePath = this.resolveUploadPath(relativePath);
    try {
      if (fs.existsSync(absolutePath)) {
        await fs.promises.unlink(absolutePath);
      }
    } catch {
      return;
    }
  }

  private async findOrderFile(
    orderId: string,
    fileId: string,
  ): Promise<OrderFile> {
    const file = await this.prisma.orderFile.findFirst({
      where: { id: fileId, orderId, deletedAt: null },
    });

    if (!file) {
      throw new NotFoundException('Order file not found');
    }

    return file;
  }

  private resolveUploadPath(relativePath: string): string {
    const normalized = relativePath.replace(/\\/g, '/');
    if (normalized.startsWith('/') || normalized.includes('..')) {
      throw new BadRequestException('Invalid stored file path');
    }

    const absolutePath = path.resolve(UPLOAD_ROOT, normalized);
    if (!absolutePath.startsWith(path.resolve(UPLOAD_ROOT))) {
      throw new BadRequestException('Invalid stored file path');
    }

    return absolutePath;
  }

  private mapToDto(order: OrderWithRelations): OrderResponseDto {
    return {
      id: order.id,
      orderCode: order.orderCode,
      doctorId: order.doctorId,
      patientId: order.patientId,
      assignedDesignerId: order.assignedDesignerId ?? undefined,
      status: order.status,
      patientStage: order.patientStage ?? undefined,
      chiefComplaint: order.chiefComplaint ?? undefined,
      archTreatment: order.archTreatment ?? undefined,
      treatBothArch: order.treatBothArch,
      treatmentPlan: order.treatmentPlan ?? undefined,
      dontMoveOption: order.dontMoveOption ?? undefined,
      apRelationship: order.apRelationship ?? undefined,
      anteroposteriorRelationship:
        order.anteroposteriorRelationship ?? undefined,
      elastics: order.elastics ?? undefined,
      openBite: order.openBite ?? undefined,
      midline: order.midline ?? undefined,
      ipr: order.ipr ?? undefined,
      biteRamps: order.biteRamps ?? undefined,
      expansion: order.expansion ?? undefined,
      crossbite: order.crossbite ?? undefined,
      spaces: order.spaces ?? undefined,
      extractions: order.extractions ?? undefined,
      specialInstructions: order.specialInstructions ?? undefined,
      additionalInstructions: order.additionalInstructions ?? undefined,
      useCbctWithScans: order.useCbctWithScans,
      wantsManufacturing: order.wantsManufacturing,
      materials: order.materials,
      toothInstructions: order.toothInstructions,
      files: order.files.map((file) => this.mapFileToDto(file)),
      doctor: order.doctor,
      patient: {
        id: order.patient.id,
        fullName: order.patient.fullName,
        email: order.patient.email ?? undefined,
        phone: order.patient.phone ?? undefined,
      },
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      submittedAt: order.submittedAt ?? undefined,
      // Notification fields used by the orders list to render badges
      // ("Awaiting your review", "Approved", "Replanning requested", …).
      latestPlanStatus: order.treatmentPlans?.[0]?.status ?? undefined,
      treatmentPlansCount: order._count?.treatmentPlans ?? 0,
    };
  }

  private mapFileToDto(file: OrderFile): OrderFileResponseDto {
    return {
      id: file.id,
      category: file.category,
      originalName: file.originalName,
      fileName: file.fileName,
      relativePath: file.relativePath,
      mimeType: file.mimeType,
      size: file.size,
      createdAt: file.createdAt,
    };
  }
}
