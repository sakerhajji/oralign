import { labZipFileName, splitUploadSlot } from './upload-slot';

const file = (
  over: Partial<{
    originalName: string | null;
    generatedName: string | null;
    relativePath: string;
    category: string;
  }>,
) => ({
  originalName: null,
  generatedName: null,
  relativePath: 'orders/o1/image/fallback.jpg',
  category: 'image',
  ...over,
});

describe('upload slots', () => {
  describe('splitUploadSlot', () => {
    it('splits the slot key the order form prefixes onto a filename', () => {
      expect(splitUploadSlot('left-lateral__IMG_1234.jpg')).toEqual({
        slotKey: 'left-lateral',
        rest: 'IMG_1234.jpg',
      });
    });

    it('leaves a plain client filename alone', () => {
      expect(splitUploadSlot('IMG_0042.jpg')).toEqual({
        slotKey: null,
        rest: 'IMG_0042.jpg',
      });
    });
  });

  describe('labZipFileName — lab ZIP entry names', () => {
    // The folder of these two already states the side (in the clinic's
    // mirrored convention); the slot key named the opposite side.
    it.each([
      ['left_photo', 'left-lateral__IMG_1234.jpg', 'IMG_1234.jpg'],
      ['right_photo', 'right-lateral__IMG_5678.jpg', 'IMG_5678.jpg'],
    ])(
      'drops the side-bearing slot key of a %s file',
      (category, originalName, expected) => {
        expect(labZipFileName(file({ category, originalName }))).toBe(expected);
      },
    );

    it('never leaves a left/right token from an internal slot key in the name', () => {
      const names = ['left-lateral__a.jpg', 'right-lateral__b.jpg'].map(
        (originalName) =>
          labZipFileName(file({ category: 'left_photo', originalName })),
      );
      for (const name of names) expect(name).not.toMatch(/left|right/i);
    });

    // These prefixes carry what the folder cannot — keep them.
    it.each([
      ['stl', 'upper-stl__scan.stl'],
      ['stl', 'lower-stl__scan.stl'],
      ['stl', 'first-occlusion__bite.stl'],
      ['left_photo', 'profile__portrait.jpg'],
      ['front_photo', 'smile__IMG_2.jpg'],
    ])(
      'keeps the informative slot key of a %s file (%s)',
      (category, originalName) => {
        expect(labZipFileName(file({ category, originalName }))).toBe(
          originalName,
        );
      },
    );

    it('keeps upper and lower scans distinguishable inside the shared STL folder', () => {
      const upper = labZipFileName(
        file({ category: 'stl', originalName: 'upper-stl__scan.stl' }),
      );
      const lower = labZipFileName(
        file({ category: 'stl', originalName: 'lower-stl__scan.stl' }),
      );
      expect(upper).not.toBe(lower);
    });

    it("never rewrites the doctor's own filename, even when it mentions a side", () => {
      expect(
        labZipFileName(file({ originalName: 'photo cote gauche left.jpg' })),
      ).toBe('photo cote gauche left.jpg');
    });

    it('keeps the name when the slot key has nothing after it', () => {
      expect(
        labZipFileName(
          file({ category: 'left_photo', originalName: 'left-lateral__' }),
        ),
      ).toBe('left-lateral__');
    });

    it('drops the side-bearing category from a generated name when there is no client name', () => {
      expect(
        labZipFileName(
          file({
            category: 'left_photo',
            generatedName: 'Dr-Hajji_Marie-Dupont_left-photo_004.jpg',
          }),
        ),
      ).toBe('Dr-Hajji_Marie-Dupont_004.jpg');
    });

    it('keeps a generated name whose category names no side', () => {
      expect(
        labZipFileName(
          file({
            category: 'stl',
            generatedName: 'Dr-Hajji_Marie-Dupont_stl_001.stl',
          }),
        ),
      ).toBe('Dr-Hajji_Marie-Dupont_stl_001.stl');
    });

    it('falls back to the stored path basename', () => {
      expect(
        labZipFileName(file({ relativePath: 'orders/o1/pdf/report.pdf' })),
      ).toBe('report.pdf');
    });
  });
});
