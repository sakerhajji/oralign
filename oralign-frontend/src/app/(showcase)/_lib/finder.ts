/**
 * Public "Trouver un praticien" data layer.
 *
 * Plain unauthenticated `fetch` against the NestJS public directory + booking
 * endpoints (global prefix `/api`). No tokens, no cookies — every route used
 * here is `@Public()`. Runs in the browser (the finder is a client component),
 * so it relies on `NEXT_PUBLIC_API_URL` which Next inlines into the bundle.
 */

export type Lang = "fr" | "en" | "ar";

/** Lowercase enum values shared with the backend `DayOfWeek`. */
export type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

/** A publicly listable practitioner. Never carries taxId / clinicEmail. */
export interface PublicPractitioner {
  id: string;
  practitionerName: string;
  clinicName: string;
  specialty: string | null;
  clinicAddress: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  clinicPhone: string | null;
  description: string | null;
  logoUrl: string | null;
  avatarUrl: string | null;
  /** Only present when the list was queried with lat/lng. */
  distanceKm?: number;
}

export interface WorkingHour {
  dayOfWeek: DayOfWeek;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}

export type PractitionerDetail = PublicPractitioner & {
  workingHours: WorkingHour[];
};

export interface ListResponse {
  data: PublicPractitioner[];
  total: number;
  page: number;
  limit: number;
}

export interface AvailabilityDay {
  date: string; // YYYY-MM-DD
  dayOfWeek: DayOfWeek;
  slots: string[]; // ISO datetimes, available only
}

export interface AvailabilityResponse {
  days: AvailabilityDay[];
  nextAvailable: string | null;
}

export interface CreateAppointmentBody {
  dentistProfileId: string;
  patientName: string;
  patientEmail: string;
  patientPhone?: string;
  patientAddress?: string;
  message?: string;
  requestedAt: string; // ISO
  lang: Lang;
}

export interface AppointmentCreated {
  id: string;
  status: "pending";
  requestedAt: string;
}

/** Discriminated result so the booking form can branch on 409 conflicts. */
export type CreateAppointmentResult =
  | { ok: true; data: AppointmentCreated }
  | { ok: false; status: number; message?: string; nextAvailable?: string | null };

export interface ListParams {
  page?: number;
  limit?: number;
  city?: string;
  specialty?: string;
  search?: string;
  lat?: number;
  lng?: number;
}

function apiBase(): string {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api";
  return base.replace(/\/$/, "");
}

/**
 * Resolve a backend-relative `/uploads/...` path (practitioner avatar, clinic
 * logo) to an absolute URL. Uploaded files are served from the API ORIGIN, not
 * under the `/api` prefix — so a raw relative path in an `<img src>` would 404
 * against the frontend origin. Absolute URLs and data: URIs pass through;
 * null / empty → null.
 */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^(https?:)?\/\//i.test(path) || path.startsWith("data:")) return path;
  const origin = apiBase().replace(/\/api\/?$/, "");
  return `${origin}${path.startsWith("/") ? "" : "/"}${path}`;
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}

/** GET /dentist-profile/public — paginated public directory. */
export async function fetchPractitioners(
  params: ListParams = {},
  signal?: AbortSignal,
): Promise<ListResponse> {
  const query = toQuery({
    page: params.page,
    limit: params.limit,
    city: params.city,
    specialty: params.specialty,
    search: params.search,
    lat: params.lat,
    lng: params.lng,
  });
  const res = await fetch(`${apiBase()}/dentist-profile/public${query}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`list_failed_${res.status}`);
  return (await res.json()) as ListResponse;
}

/** GET /dentist-profile/public/:id — detail + working hours. */
export async function fetchPractitioner(
  id: string,
  signal?: AbortSignal,
): Promise<PractitionerDetail> {
  const res = await fetch(`${apiBase()}/dentist-profile/public/${encodeURIComponent(id)}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`detail_failed_${res.status}`);
  return (await res.json()) as PractitionerDetail;
}

/** GET /appointments/availability/:dentistProfileId — bookable 30-min slots. */
export async function fetchAvailability(
  dentistProfileId: string,
  opts: { from?: string; days?: number } = {},
  signal?: AbortSignal,
): Promise<AvailabilityResponse> {
  const query = toQuery({ from: opts.from, days: opts.days });
  const res = await fetch(
    `${apiBase()}/appointments/availability/${encodeURIComponent(dentistProfileId)}${query}`,
    { headers: { Accept: "application/json" }, signal },
  );
  if (!res.ok) throw new Error(`availability_failed_${res.status}`);
  return (await res.json()) as AvailabilityResponse;
}

/** POST /appointments — create a pending appointment request. */
export async function createAppointment(
  body: CreateAppointmentBody,
): Promise<CreateAppointmentResult> {
  try {
    const res = await fetch(`${apiBase()}/appointments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = (await res.json()) as AppointmentCreated;
      return { ok: true, data };
    }

    // Parse the error payload best-effort (409 carries { message, nextAvailable }).
    let message: string | undefined;
    let nextAvailable: string | null | undefined;
    try {
      const err = (await res.json()) as {
        message?: string | string[];
        nextAvailable?: string | null;
      };
      message = Array.isArray(err.message) ? err.message.join(", ") : err.message;
      nextAvailable = err.nextAvailable;
    } catch {
      /* non-JSON body — ignore */
    }
    return { ok: false, status: res.status, message, nextAvailable };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** Small helper: JS Date → lowercase DayOfWeek. */
export function dayOfWeekOf(date: Date): DayOfWeek {
  const names: DayOfWeek[] = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  return names[date.getDay()];
}
