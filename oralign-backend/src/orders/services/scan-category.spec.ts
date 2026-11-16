import { OrderFileCategory } from '@prisma/client';
import { resolveUploadCategory } from './scan-category';

describe('resolveUploadCategory', () => {
  it.each([
    [OrderFileCategory.stl, 'upper-stl__scan.ply', OrderFileCategory.ply],
    [OrderFileCategory.stl, 'lower-stl__scan.OBJ', OrderFileCategory.obj],
    [OrderFileCategory.ply, 'first-occlusion__bite.stl', OrderFileCategory.stl],
    [OrderFileCategory.obj, 'scan.ply', OrderFileCategory.ply],
    [OrderFileCategory.stl, 'scan.stl', OrderFileCategory.stl],
  ])(
    'files a scan sent as %s named %p under %s',
    (requested, name, expected) => {
      expect(resolveUploadCategory(requested, name)).toBe(expected);
    },
  );

  it.each([
    // Outside the scan categories the requested slot category stands.
    [OrderFileCategory.other, 'scan.ply'],
    [OrderFileCategory.zip, 'scan.stl'],
    [OrderFileCategory.front_photo, 'photo.obj'],
    // A scan category with a non-scan file keeps its category too.
    [OrderFileCategory.stl, 'notes.pdf'],
  ])('keeps %s for %p', (requested, name) => {
    expect(resolveUploadCategory(requested, name)).toBe(requested);
  });
});
