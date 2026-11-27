import {
  ArchTreatment,
  OrderStatus,
  OrderType,
  SupplementalCoverageStatus,
  SupplementalReviewStatus,
} from '@prisma/client';
import {
  admin,
  childRow,
  doctor,
  failureOf,
  fakeDb,
  makeServices,
  PARENT_ID,
} from './fake-db.helper-spec';

/**
 * Doctor inactivity (spec §5): supplemental requests follow the initial
 * order rule. A dormant doctor's case gets no new request (create, the
 * paid replacement of a rejected warranty) and no submission, also when
 * an admin acts: 403 ACCOUNT_DORMANT, nothing written.
 */

const KEY = 'key-0000-0001';
const DORMANT = { fullName: 'Actor', inactiveSince: new Date('2026-06-01') };

describe('supplemental requests — dormant doctor', () => {
  it.each([doctor, admin])('create is refused (%j)', async (caller) => {
    const db = fakeDb();
    db.tx.user.findUnique.mockResolvedValue(DORMANT);
    const { requests } = makeServices(db);

    const failure = await failureOf(
      requests.create(
        PARENT_ID,
        { type: OrderType.additional_aligners },
        KEY,
        caller,
      ),
    );

    expect(failure).toMatchObject({
      status: 403,
      errorCode: 'ACCOUNT_DORMANT',
    });
    expect(db.tx.dentalOrder.create).not.toHaveBeenCalled();
  });

  it('submit is refused under the doctor row lock, before any write', async () => {
    const db = fakeDb({ children: [childRow()] });
    db.tx.$queryRaw.mockImplementation((sql: TemplateStringsArray) =>
      Promise.resolve(
        sql.join('?').includes('FOR KEY SHARE')
          ? [{ inactiveSince: new Date('2026-06-01') }]
          : [],
      ),
    );
    const { requests } = makeServices(db);

    expect(await failureOf(requests.submit('child-1', doctor))).toMatchObject({
      status: 403,
      errorCode: 'ACCOUNT_DORMANT',
    });
    expect(db.tx.dentalOrder.update).not.toHaveBeenCalled();
    expect(db.tx.supplementalOrderRequest.update).not.toHaveBeenCalled();
  });

  it('a rejected warranty cannot become a NEW paid replacement', async () => {
    const db = fakeDb({
      children: [
        childRow(
          {
            id: 'warranty-1',
            orderCode: 'CASE-001-WAR-01',
            orderType: OrderType.warranty,
            status: OrderStatus.rejected,
            archTreatment: ArchTreatment.lower,
          },
          {
            id: 'warranty-request',
            reviewStatus: SupplementalReviewStatus.rejected,
            coverageStatus: SupplementalCoverageStatus.warranty_rejected,
            defectiveAligners: [5],
          },
        ),
      ],
    });
    db.tx.user.findUnique.mockResolvedValue(DORMANT);
    const { reviews } = makeServices(db);

    expect(
      await failureOf(reviews.convertRejectedWarranty('warranty-1', doctor)),
    ).toMatchObject({ status: 403, errorCode: 'ACCOUNT_DORMANT' });
    expect(db.tx.dentalOrder.create).not.toHaveBeenCalled();
  });
});
