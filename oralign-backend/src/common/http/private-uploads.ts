import { posix } from 'path';
import type { NextFunction, Request, Response } from 'express';

/**
 * Upload folders that hold patient records. Their files are served ONLY by
 * the authenticated, RBAC-checked routes (GET orders/:id/files/:fileId/
 * download, the treatment-plan streams, the production streams), never by
 * the public static handler: a stored name is `<Doctor>_<Patient>_
 * <category>_<NNN>.<ext>` under `orders/<orderId>/<category>/`, which
 * anyone who has seen an order can rebuild, and a static URL keeps working
 * after the account that saw it is deactivated.
 */
export const PRIVATE_UPLOAD_DIRS: readonly string[] = ['orders'];

/**
 * Whether a request path below the `/uploads` mount reaches a private
 * folder, however it is spelled: percent-encoded (`%6Frders`), with doubled
 * slashes, dot segments or backslashes, in any case. serve-static decodes
 * and normalises the path before it touches the disk, so the check must
 * too. A path that cannot be decoded is refused.
 */
export function isPrivateUploadPath(requestPath: string): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return true;
  }
  const normalised = posix
    .normalize(`/${decoded.replace(/\\/g, '/')}`)
    .toLowerCase();
  const first = normalised.split('/').find((segment) => segment !== '');
  return first !== undefined && PRIVATE_UPLOAD_DIRS.includes(first);
}

/**
 * Express middleware for the `/uploads` mount, registered BEFORE the static
 * handler: a private folder answers 404, exactly like a missing file, so
 * the response tells nothing about what exists.
 */
export function privateUploadsGuard(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (isPrivateUploadPath(req.path)) {
    res.status(404).end();
    return;
  }
  next();
}
