/**
 * Human-friendly byte formatter (1.2 MB, 873 KB, 1.4 GB, …). Rounds to
 * one decimal so a 207 MB CBCT archive reads as "207.4 MB" rather than
 * "207426742 B". Shared by the upload progress strip and the full-order
 * export toast.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
