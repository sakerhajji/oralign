'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Upload } from 'lucide-react';
import { ImageEditDialog } from '@/components/orders/image-edit-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { getAvatarUrl } from '@/lib/utils';

interface PatientProfilePhotoFieldProps {
  value: File | null;
  existingUrl?: string | null;
  disabled?: boolean;
  label: string;
  hint: string;
  uploadLabel: string;
  changeLabel: string;
  editorTitle: string;
  alt: string;
  onChange: (file: File | null) => void;
}

/**
 * Patient identity photo field shared by the patient sheet and the inline
 * patient form in the order wizard. The edit dialog is the same crop/rotate/
 * flip workflow used by order images, so photos are normalized before upload.
 */
export function PatientProfilePhotoField({
  value,
  existingUrl,
  disabled = false,
  label,
  hint,
  uploadLabel,
  changeLabel,
  editorTitle,
  alt,
  onChange,
}: PatientProfilePhotoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [editorFile, setEditorFile] = useState<File | null>(null);
  const localPreview = useMemo(
    () => (value ? URL.createObjectURL(value) : null),
    [value],
  );

  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  const imageUrl = localPreview ?? getAvatarUrl(existingUrl);

  const openPicker = () => {
    if (!disabled) inputRef.current?.click();
  };

  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <Avatar className="size-16 shrink-0 ring-2 ring-background ring-offset-1 ring-offset-border">
            {imageUrl ? <AvatarImage src={imageUrl} alt={alt} /> : null}
            <AvatarFallback className="bg-primary/10 text-primary">
              <Camera className="size-6" aria-hidden="true" />
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{label}</p>
            <p className="mt-0.5 max-w-md text-xs leading-relaxed text-muted-foreground">
              {hint}
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full shrink-0 gap-1.5 sm:w-auto"
          disabled={disabled}
          onClick={openPicker}
        >
          <Upload className="size-4" aria-hidden="true" />
          {value || existingUrl ? changeLabel : uploadLabel}
        </Button>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            event.target.value = '';
            if (file) setEditorFile(file);
          }}
        />
      </div>

      <ImageEditDialog
        file={editorFile}
        title={editorTitle}
        onCancel={() => setEditorFile(null)}
        onConfirm={(file) => {
          onChange(file);
          setEditorFile(null);
        }}
      />
    </div>
  );
}
