import { OrderStatus, OrderType, UserRole } from '@prisma/client';
import type { Caller } from '../../common/access/caller';
import { DOCTOR_SUMMARY_SELECT } from '../../common/doctor/doctor-identity';
import {
  mapOrderToDto,
  orderDoctorOf,
  orderInclude,
  type OrderWithRelations,
} from './order.mapper';

/**
 * The order's doctor reads the shared live summary (DECISIONS §6: one
 * DOCTOR_SUMMARY_SELECT for every live screen), so the orders list, the
 * order detail and the doctor dashboard show the same contact as the
 * patient desk and the documents: the practice phone and e-mail first,
 * the account ones as fallback.
 */

const created = new Date('2026-11-27T09:30:00.000Z');

/** A doctor row as DOCTOR_SUMMARY_SELECT reads it. */
function doctorRow(
  over: Record<string, unknown> = {},
  clinic: Record<string, unknown> | null = {},
) {
  return {
    id: 'u-doc',
    fullName: 'Dr Salma Ben Ali',
    email: 'salma@login.tn',
    phone: '+21620000000',
    avatarUrl: '/uploads/avatars/salma.webp',
    isActive: true,
    deletedAt: null,
    dentistProfile:
      clinic === null
        ? null
        : {
            clinicName: 'Cabinet Ben Ali',
            clinicAddress: '12 rue de Carthage',
            city: 'Tunis',
            country: 'TN',
            clinicPhone: '+21671000000',
            clinicEmail: 'contact@cabinet.tn',
            logoUrl: null,
            specialty: 'Orthodontie',
            deletedAt: null,
            ...clinic,
          },
    ...over,
  };
}

function order(doctor: unknown = doctorRow()): OrderWithRelations {
  return {
    id: 'o-1',
    orderCode: 'ORD-1',
    doctorId: 'u-doc',
    patientId: 'pt-1',
    assignedDesignerId: 'u-des',
    status: OrderStatus.treatment_planning,
    orderType: OrderType.initial,
    parentOrderId: null,
    treatBothArch: true,
    useCbctWithScans: false,
    wantsManufacturing: true,
    materials: [],
    toothInstructions: [],
    files: [],
    doctor,
    patient: { id: 'pt-1', fullName: 'Ines' },
    createdAt: created,
    updatedAt: created,
    treatmentPlans: [],
  } as unknown as OrderWithRelations;
}

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const superAdmin: Caller = { userId: 'u-root', role: UserRole.super_admin };
const owner: Caller = { userId: 'u-doc', role: UserRole.dentist };
const otherDoctor: Caller = { userId: 'u-other', role: UserRole.dentist };
const designer: Caller = { userId: 'u-des', role: UserRole.designer };

describe('order doctor: the shared DOCTOR_SUMMARY_SELECT', () => {
  it('the order include reads the doctor through the shared select', () => {
    expect(orderInclude.doctor).toEqual({ select: DOCTOR_SUMMARY_SELECT });
  });

  it.each([admin, superAdmin, owner])(
    '%p reads the whole summary, the practice contact first',
    (viewer) => {
      expect(mapOrderToDto(order(), viewer).doctor).toEqual({
        id: 'u-doc',
        fullName: 'Dr Salma Ben Ali',
        email: 'salma@login.tn',
        phone: '+21620000000',
        avatarUrl: '/uploads/avatars/salma.webp',
        isActive: true,
        deletedAt: null,
        clinic: {
          clinicName: 'Cabinet Ben Ali',
          clinicAddress: '12 rue de Carthage',
          city: 'Tunis',
          country: 'TN',
          clinicPhone: '+21671000000',
          clinicEmail: 'contact@cabinet.tn',
          logoUrl: null,
          specialty: 'Orthodontie',
        },
        contactPhone: '+21671000000',
        contactEmail: 'contact@cabinet.tn',
        clinicName: 'Cabinet Ben Ali',
      });
    },
  );

  it('falls back to the account contact when the practice has none', () => {
    const dto = mapOrderToDto(
      order(doctorRow({}, { clinicPhone: '  ', clinicEmail: null })),
      admin,
    );
    expect(dto.doctor).toMatchObject({
      contactPhone: '+21620000000',
      contactEmail: 'salma@login.tn',
      clinicName: 'Cabinet Ben Ali',
    });
  });

  it('a doctor without a practice profile: no clinic, the account contact', () => {
    const dto = mapOrderToDto(order(doctorRow({}, null)), owner);
    expect(dto.doctor).toMatchObject({
      clinic: null,
      contactPhone: '+21620000000',
      contactEmail: 'salma@login.tn',
    });
    expect(dto.doctor?.clinicName).toBeUndefined();
  });

  it.each([designer, otherDoctor, null, undefined])(
    '%p (designer, lab exports) keeps the name, login e-mail and practice name only',
    (viewer) => {
      const doctor = mapOrderToDto(order(), viewer).doctor;
      expect(doctor).toEqual({
        id: 'u-doc',
        fullName: 'Dr Salma Ben Ali',
        email: 'salma@login.tn',
        clinicName: 'Cabinet Ben Ali',
      });
      const body = JSON.stringify(doctor);
      expect(body).not.toContain('+216');
      expect(body).not.toContain('Carthage');
      expect(body).not.toContain('contact@cabinet.tn');
    },
  );

  it('a soft-deleted practice profile is no practice (the shared rule)', () => {
    const row = doctorRow({}, { deletedAt: created });
    expect(orderDoctorOf(row as never, 'u-doc', admin)).toMatchObject({
      clinic: null,
      contactEmail: 'salma@login.tn',
    });
    expect(
      orderDoctorOf(row as never, 'u-doc', designer).clinicName,
    ).toBeUndefined();
  });
});
