'use client';

import { UserRound } from 'lucide-react';
import { useAuthedImage } from '@/lib/hooks/use-authed-image';
import { OrderFileCategory, type DentalOrder, type OrderFile } from '@/lib/types';
import { cn } from '@/lib/utils';

type PatientPhotoSize = 'table' | 'card';

const sizeClasses: Record<PatientPhotoSize, string> = {
  table: 'size-9',
  card: 'size-11',
};

/**
 * The face-at-rest upload uses the slot prefix before the original filename.
 * Keeping the lookup here means list pages do not have to guess from the
 * generic `image` category, which also contains radiographs and other files.
 */
function findFaceAtRestFile(files: OrderFile[] | undefined): OrderFile | null {
  if (!files) return null;

  return (
    files
      .filter(
        (file) =>
          file.category === OrderFileCategory.IMAGE &&
          file.mimeType.startsWith('image/') &&
          /^(face-rest|face_rest)__/.test(file.originalName.trim().toLowerCase()),
      )
      .sort(
        (first, second) =>
          new Date(second.createdAt).getTime() -
          new Date(first.createdAt).getTime(),
      )[0] ?? null
  );
}

function orderFilePreviewUrl(orderId: string, fileId: string): string {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
  return `${apiBase}/orders/${orderId}/files/${fileId}/download?variant=thumb`;
}

export function PatientRestPhoto({
  order,
  size = 'table',
  alt = 'Patient face at rest photo',
  className,
}: {
  order: Pick<DentalOrder, 'id' | 'files'>;
  size?: PatientPhotoSize;
  alt?: string;
  className?: string;
}) {
  const file = findFaceAtRestFile(order.files);
  const previewUrl = file ? orderFilePreviewUrl(order.id, file.id) : null;
  const { src, loading } = useAuthedImage(previewUrl);

  return (
    <span
      className={cn(
        'relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-muted-foreground ring-1 ring-border',
        sizeClasses[size],
        className,
      )}
      title={file ? alt : undefined}
      aria-label={file ? alt : undefined}
    >
      {loading ? (
        <span className="absolute inset-1 animate-pulse rounded-full bg-muted-foreground/10" />
      ) : src ? (
        // The order file endpoint is authenticated, so use the cached blob
        // URL returned by useAuthedImage instead of a public image URL.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : (
        <UserRound className={cn(size === 'card' ? 'size-5' : 'size-4')} aria-hidden="true" />
      )}
    </span>
  );
}
