import type { NextFunction, Request, Response } from 'express';
import { isPrivateUploadPath, privateUploadsGuard } from './private-uploads';

describe('private uploads (patient records never served by /uploads)', () => {
  it.each([
    '/orders/2b1c/front_photo/Dr-X_Marie-Dupont_front-photo_003.jpg',
    '/orders/2b1c/front_photo/variants/Dr-X_Marie-Dupont_front-photo_003-md.webp',
    '/orders/2b1c/quotes/DEV-2026-001.pdf',
    '/orders',
    '/orders/',
    '//orders/a.jpg',
    '/./orders/a.jpg',
    '/avatars/../orders/a.jpg',
    '/%6Frders/a.jpg',
    '/%2Forders/a.jpg',
    '/ORDERS/a.jpg',
    '/Orders/a.jpg',
    '\\orders\\a.jpg',
    '/%5Corders%5Ca.jpg',
    '/%E0%A4%A', // malformed escape: refused
    // Bank-transfer receipts, legacy folders (spec §1: private).
    '/payments/0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0.pdf',
    '/payments',
    '/PAYMENTS/a.jpg',
    '/%70ayments/a.jpg',
    '/avatars/../payments/a.jpg',
    '/treatment-fee-proofs/1764235800000-recu.pdf',
    '/Treatment-Fee-Proofs/a.png',
    '//treatment-fee-proofs/a.png',
    // ...and the new home under the order.
    '/orders/o-1/payment-proofs/0f1e2d3c.jpg',
  ])('%s is private', (path) => {
    expect(isPrivateUploadPath(path)).toBe(true);
  });

  it.each([
    '/avatars/abc.webp',
    '/blog/x.webp',
    '/slider/a.png',
    '/company-logos/l.png',
    '/patient-photos/p.jpg',
    '/orders-archive/a.jpg',
    '/avatars/orders/a.jpg',
    '/payments-old/a.jpg',
    '/blog/payments/a.jpg',
    '/',
    '',
  ])('%s is public as before', (path) => {
    expect(isPrivateUploadPath(path)).toBe(false);
  });

  it('the middleware answers 404 on a private path and lets the rest through', () => {
    const end = jest.fn();
    const status = jest.fn().mockReturnValue({ end });
    const res = { status } as unknown as Response;
    const next = jest.fn() as NextFunction;

    privateUploadsGuard({ path: '/orders/o-1/a.jpg' } as Request, res, next);
    expect(status).toHaveBeenCalledWith(404);
    expect(end).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();

    privateUploadsGuard({ path: '/avatars/a.webp' } as Request, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
