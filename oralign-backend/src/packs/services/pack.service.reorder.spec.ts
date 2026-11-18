import { BadRequestException } from '../../common/exceptions/app.exception';
import type { PrismaService } from '../../prisma/prisma.service';
import { applyPackOrder } from '../pack-order';
import { PackService } from './pack.service';

describe('applyPackOrder', () => {
  it('reorders the whole catalogue', () => {
    expect(applyPackOrder(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('keeps packs that were not listed in their place', () => {
    // "b" is inactive and hidden from the table: a and c swap around it.
    expect(applyPackOrder(['a', 'b', 'c'], ['c', 'a'])).toEqual([
      'c',
      'b',
      'a',
    ]);
  });
});

describe('PackService.reorder', () => {
  const setup = (rows: { id: string; displayOrder: number }[]) => {
    const update = jest.fn().mockResolvedValue({});
    const tx = {
      pack: { findMany: jest.fn().mockResolvedValue(rows), update },
    };
    const prisma = {
      $transaction: (run: (client: typeof tx) => unknown) => run(tx),
    } as unknown as PrismaService;
    return { service: new PackService(prisma), update };
  };

  it('numbers the packs from 1 and only writes the ones that moved', async () => {
    const { service, update } = setup([
      { id: 'a', displayOrder: 1 },
      { id: 'b', displayOrder: 2 },
      { id: 'c', displayOrder: 3 },
    ]);

    await expect(service.reorder(['a', 'c', 'b'])).resolves.toEqual({
      packIds: ['a', 'c', 'b'],
    });

    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'c' },
      data: { displayOrder: 2 },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'b' },
      data: { displayOrder: 3 },
    });
  });

  it('refuses a pack that is unknown or archived', async () => {
    const { service, update } = setup([{ id: 'a', displayOrder: 1 }]);

    await expect(service.reorder(['a', 'gone'])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(update).not.toHaveBeenCalled();
  });
});
