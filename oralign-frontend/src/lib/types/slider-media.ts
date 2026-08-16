// Slider media (doctor dashboard carousel)
// Split out of the former 2,000-line lib/types/index.ts; import via '@/lib/types'.

// ==========================================
// SLIDER MEDIA (Doctor dashboard carousel)
// ==========================================

export enum SliderMediaType {
  IMAGE = 'image',
  VIDEO = 'video',
}

export enum SliderMediaSourceType {
  UPLOAD = 'upload',
  EXTERNAL = 'external',
}

export enum SliderMediaDeviceTarget {
  DESKTOP = 'desktop',
  MOBILE = 'mobile',
}

export enum SliderMediaStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export interface SliderMedia {
  id: string;
  title: string;
  mediaType: SliderMediaType;
  sourceType: SliderMediaSourceType;
  deviceTargets: SliderMediaDeviceTarget[];
  desktopUrl: string | null;
  mobileUrl: string | null;
  status: SliderMediaStatus;
  displayOrder: number;
  linkUrl: string | null;
  createdById: string | null;
  createdBy?: { id: string; fullName: string } | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SliderMediaFilters {
  page?: number;
  limit?: number;
  status?: SliderMediaStatus;
  device?: SliderMediaDeviceTarget;
  mediaType?: SliderMediaType;
  search?: string;
  includeDeleted?: boolean;
  deletedOnly?: boolean;
}

export interface CreateSliderMediaInput {
  title: string;
  mediaType: SliderMediaType;
  sourceType: SliderMediaSourceType;
  deviceTargets: SliderMediaDeviceTarget[];
  desktopUrl?: string;
  mobileUrl?: string;
  status?: SliderMediaStatus;
  displayOrder?: number;
  linkUrl?: string;
  desktopFile?: File;
  mobileFile?: File;
}

export interface UpdateSliderMediaInput {
  title?: string;
  mediaType?: SliderMediaType;
  sourceType?: SliderMediaSourceType;
  deviceTargets?: SliderMediaDeviceTarget[];
  desktopUrl?: string;
  mobileUrl?: string;
  clearDesktopUrl?: boolean;
  clearMobileUrl?: boolean;
  status?: SliderMediaStatus;
  displayOrder?: number;
  linkUrl?: string;
  desktopFile?: File;
  mobileFile?: File;
}
