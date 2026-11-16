import { classifyMedia, meshFormatOf } from './media.constants';

describe('meshFormatOf', () => {
  it.each([
    ['Dr-X_Patient_stl_001.stl', 'stl'],
    ['upper__SCAN.PLY', 'ply'],
    ['lower.Obj', 'obj'],
    ['archive.ply.zip', null],
    ['notes.txt', null],
    ['ply', null],
    ['', null],
  ])('%p → %p', (name, expected) => {
    expect(meshFormatOf(name)).toBe(expected);
  });
});

describe('classifyMedia', () => {
  it.each([
    // 3D scans: the extension decides, whatever the browser claimed.
    ['application/octet-stream', 'scan.stl', 'stl'],
    ['application/octet-stream', 'scan.ply', 'ply'],
    ['', 'scan.obj', 'obj'],
    ['model/stl', 'scan.ply', 'ply'],
    ['text/plain', 'scan.obj', 'obj'],
    // Mime only matters when the name has no known extension.
    ['model/stl', 'scan', 'stl'],
    ['application/sla', 'scan.bin', 'stl'],
    ['model/ply', 'scan', 'ply'],
    ['model/obj', 'scan', 'obj'],
    // Unchanged neighbours.
    ['image/png', 'photo.png', 'image'],
    ['image/png', 'scan.stl', 'image'],
    ['application/zip', 'cbct.bin', 'zip'],
    ['application/octet-stream', 'cbct.zip', 'zip'],
    ['image/heic', 'photo.heic', null],
    ['application/pdf', 'sheet.pdf', null],
    ['application/octet-stream', '__proto__', null],
  ])('%p + %p → %p', (mime, name, expected) => {
    expect(classifyMedia(mime, name)).toBe(expected);
  });
});
