import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions/app.exception';

/**
 * The files a treatment plan version keeps on disk: its analysis PDFs and
 * its movement / dental table images, under `uploads/orders/<orderId>/
 * treatment-plans/<planId>/…` (never served statically, see
 * common/http/private-uploads.ts).
 *
 * A renewal after a rejection copies the plan's rows to the new version
 * WITHOUT copying the bytes: several rows may point at one file. So a
 * file is removed only by `releasePlanFile`, and only once no row refers
 * to it any more; a replace or a delete on one version never breaks the
 * picture or the PDF another version still shows.
 */

/** Same root as LocalStorageService and the order files. */
const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');

function absoluteInsideRoot(relPath: string): string | null {
  const abs = path.resolve(UPLOAD_ROOT, relPath);
  const root = path.resolve(UPLOAD_ROOT) + path.sep;
  return abs.startsWith(root) ? abs : null;
}

/**
 * Write `buffer` under `uploads/<segments…>/<uuid><ext>` and return the
 * relative path stored in the database. The name never comes from the
 * client.
 */
export async function writePlanFile(
  segments: readonly string[],
  ext: string,
  buffer: Buffer,
): Promise<string> {
  const relDir = path.posix.join(...segments);
  const absDir = absoluteInsideRoot(relDir);
  if (!absDir) throw new ForbiddenException('Invalid file path.');
  await fs.promises.mkdir(absDir, { recursive: true });
  const relPath = path.posix.join(relDir, `${uuidv4()}${ext}`);
  await fs.promises.writeFile(
    path.join(absDir, path.basename(relPath)),
    buffer,
    {
      flag: 'wx',
    },
  );
  return relPath;
}

/** Absolute path of a stored file: 403 outside the root, 404 when gone. */
export async function resolvePlanFile(
  relPath: string,
): Promise<{ absPath: string; size: number }> {
  const absPath = absoluteInsideRoot(relPath);
  if (!absPath) throw new ForbiddenException('Invalid file path.');
  try {
    const stat = await fs.promises.stat(absPath);
    if (!stat.isFile()) throw new Error('not a file');
    return { absPath, size: stat.size };
  } catch {
    throw new NotFoundException('File no longer exists on disk.');
  }
}

/** Remove a file this request wrote and never recorded. Never throws. */
export async function discardPlanFile(relPath: string): Promise<void> {
  const abs = absoluteInsideRoot(relPath);
  if (!abs) return;
  await fs.promises.unlink(abs).catch(() => undefined);
}

/** Whether any row still points at this stored file. */
export async function isPlanFileReferenced(
  prisma: Pick<PrismaService, 'treatmentPlan' | 'treatmentPlanDocument'>,
  relPath: string,
): Promise<boolean> {
  const [document, plan] = await Promise.all([
    prisma.treatmentPlanDocument.findFirst({
      where: { storagePath: relPath },
      select: { id: true },
    }),
    prisma.treatmentPlan.findFirst({
      where: {
        OR: [
          { movementTableImagePath: relPath },
          { dentalTreatmentTableImagePath: relPath },
        ],
      },
      select: { id: true },
    }),
  ]);
  return document !== null || plan !== null;
}

/**
 * Remove a file from disk once nothing refers to it. Call it AFTER the
 * row change that dropped the reference has committed. Best effort: a
 * failure only leaves an orphan blob, never a broken record.
 */
export async function releasePlanFile(
  prisma: Pick<PrismaService, 'treatmentPlan' | 'treatmentPlanDocument'>,
  relPath: string,
  onError?: (error: unknown) => void,
): Promise<void> {
  try {
    if (await isPlanFileReferenced(prisma, relPath)) return;
    await discardPlanFile(relPath);
  } catch (error) {
    onError?.(error);
  }
}
