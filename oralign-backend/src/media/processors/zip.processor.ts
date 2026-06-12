import * as fs from 'fs';
import * as yauzl from 'yauzl';
import {
  ZIP_MAX_LISTED_ENTRIES,
  ZIP_MAX_TOP_LEVEL,
  ZIP_SUSPICIOUS_RATIO,
  ZIP_SUSPICIOUS_TOTAL_BYTES,
} from '../media.constants';
import { ZipMetadata } from '../media.types';

/**
 * Read SAFE metadata from a ZIP archive without extracting anything.
 *
 * Zip-bomb posture: we only walk the central directory (yauzl with
 * lazyEntries) and read the *declared* uncompressed sizes from entry
 * headers — no byte is ever inflated, so a 42.zip-style bomb costs us
 * one directory scan, nothing more. The caps below bound the scan
 * itself (a malicious archive can still declare 100k entries) and the
 * `suspicious` flag surfaces bombs to the UI instead of hiding them.
 *
 * CBCT/DICOM bundles are the main real-world payload here: hundreds of
 * slice files, 200-800 MB archives. The top-level listing gives the
 * admin a "what's inside" answer without ever opening the archive in
 * the browser.
 */
export function readZipMetadata(absPath: string): Promise<ZipMetadata> {
  return new Promise((resolve, reject) => {
    let archiveSize = 0;
    try {
      archiveSize = fs.statSync(absPath).size;
    } catch (error) {
      reject(error as Error);
      return;
    }

    yauzl.open(absPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        reject(err ?? new Error('Could not open ZIP'));
        return;
      }

      let entryCount = 0;
      let totalUncompressedBytes = 0;
      let truncated = false;
      const topLevel = new Set<string>();
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        try {
          zipfile.close();
        } catch {
          /* already closed */
        }
        const ratio = totalUncompressedBytes / Math.max(1, archiveSize);
        resolve({
          kind: 'zip',
          entryCount,
          topLevelEntries: [...topLevel].sort().slice(0, ZIP_MAX_TOP_LEVEL),
          totalUncompressedBytes,
          truncated,
          suspicious:
            truncated ||
            ratio > ZIP_SUSPICIOUS_RATIO ||
            totalUncompressedBytes > ZIP_SUSPICIOUS_TOTAL_BYTES,
        });
      };

      zipfile.on('entry', (entry: yauzl.Entry) => {
        entryCount += 1;
        totalUncompressedBytes += entry.uncompressedSize;

        // First path segment = what the archive "contains" at a glance.
        // Normalize backslashes (some Windows zippers) and drop empty
        // segments from leading slashes.
        const normalized = entry.fileName.replace(/\\/g, '/');
        const first = normalized.split('/').find((s) => s.length > 0);
        if (first && topLevel.size < ZIP_MAX_TOP_LEVEL) {
          topLevel.add(
            normalized.includes('/') &&
              normalized.indexOf('/') < normalized.length - 1
              ? `${first}/`
              : first,
          );
        }

        if (entryCount >= ZIP_MAX_LISTED_ENTRIES) {
          // Pathological entry count — stop scanning, flag it.
          truncated = true;
          finish();
          return;
        }
        zipfile.readEntry();
      });

      zipfile.on('end', finish);
      zipfile.on('error', (zipErr: Error) => {
        if (settled) return;
        settled = true;
        reject(zipErr);
      });

      zipfile.readEntry();
    });
  });
}
