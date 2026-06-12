'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useDebouncedCallback } from 'use-debounce';
import {
  Check,
  ExternalLink,
  Loader2,
  Locate,
  MapPin,
  Search,
  TriangleAlert,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useT } from '@/lib/i18n/lang-context';
import type { LocationPickerMapProps } from './location-picker-map';

const LocationPickerMap = dynamic<LocationPickerMapProps>(
  () =>
    import('./location-picker-map').then((m) => ({
      default: m.LocationPickerMap,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center rounded-md bg-muted/30">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

const DEFAULT_POSITION: [number, number] = [36.8065, 10.1815];

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  state?: string;
  country?: string;
}

interface PlaceSearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: NominatimAddress;
}

interface ReverseGeocodeResult {
  display_name?: string;
  address?: NominatimAddress;
}

export interface LocationValue {
  lat: number;
  lng: number;
  address?: string;
  city?: string;
  country?: string;
}

export interface LocationPickerProps {
  value?: LocationValue | null;
  onChange: (location: LocationValue) => void;
  className?: string;
}

function getCity(address?: NominatimAddress): string | undefined {
  return address?.city ?? address?.town ?? address?.village ?? address?.state;
}

function mapPlaceAddress(place: PlaceSearchResult): LocationValue {
  return {
    lat: Number(place.lat),
    lng: Number(place.lon),
    address: place.display_name,
    city: getCity(place.address),
    country: place.address?.country,
  };
}

function mapReverseAddress(
  result: ReverseGeocodeResult,
  lat: number,
  lng: number,
): LocationValue {
  return {
    lat,
    lng,
    address: result.display_name,
    city: getCity(result.address),
    country: result.address?.country,
  };
}

export function LocationPicker({ value, onChange, className }: LocationPickerProps) {
  const { t } = useT();
  const initialPosition = value ? [value.lat, value.lng] as [number, number] : DEFAULT_POSITION;
  const [position, setPosition] = useState<[number, number]>(initialPosition);
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);
  const [searchQuery, setSearchQuery] = useState(value?.address ?? '');
  const [searchResults, setSearchResults] = useState<PlaceSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!value) return;
    const next: [number, number] = [value.lat, value.lng];
    setPosition(next);
    setSearchQuery(value.address ?? '');
  }, [value?.lat, value?.lng, value?.address]);

  const googleMapsUrl = useMemo(() => {
    if (!value) return null;
    return `https://www.google.com/maps?q=${value.lat.toFixed(6)},${value.lng.toFixed(6)}`;
  }, [value]);

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    try {
      const params = new URLSearchParams({
        lat: String(lat),
        lon: String(lng),
        format: 'json',
        addressdetails: '1',
      });
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?${params.toString()}`,
      );
      if (!response.ok) {
        onChange({ lat, lng });
        return;
      }
      const result = (await response.json()) as ReverseGeocodeResult;
      const nextValue = mapReverseAddress(result, lat, lng);
      onChange(nextValue);
      if (nextValue.address) {
        setSearchQuery(nextValue.address);
      }
    } catch {
      onChange({ lat, lng });
    }
  }, [onChange]);

  const commitPosition = useCallback(
    (lat: number, lng: number, shouldReverseGeocode = true) => {
      const next: [number, number] = [lat, lng];
      setPosition(next);
      setFlyTarget(next);
      setStatusMessage(t('uiBits.locationSelected'));
      setErrorMessage(null);

      if (shouldReverseGeocode) {
        void reverseGeocode(lat, lng);
        return;
      }

      onChange({ lat, lng });
    },
    [onChange, reverseGeocode],
  );

  const searchPlaces = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setSearchResults([]);
      setErrorMessage(null);
      return;
    }

    setIsSearching(true);
    setErrorMessage(null);

    try {
      const params = new URLSearchParams({
        q: trimmed,
        format: 'json',
        addressdetails: '1',
        limit: '5',
      });
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
      );

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const results = (await response.json()) as PlaceSearchResult[];
      setSearchResults(results);
      if (results.length === 0) {
        setErrorMessage(t('uiBits.noPlacesFound'));
      }
    } catch {
      setSearchResults([]);
      setErrorMessage(t('uiBits.cantSearchNow'));
    } finally {
      setIsSearching(false);
    }
  }, [t]);

  const debouncedSearch = useDebouncedCallback(searchPlaces, 350);

  const handleSearchChange = useCallback(
    (nextValue: string) => {
      setSearchQuery(nextValue);
      setStatusMessage(null);
      debouncedSearch(nextValue);
    },
    [debouncedSearch],
  );

  const handleSelectPlace = useCallback(
    (place: PlaceSearchResult) => {
      const nextValue = mapPlaceAddress(place);
      if (!Number.isFinite(nextValue.lat) || !Number.isFinite(nextValue.lng)) {
        return;
      }

      const nextPosition: [number, number] = [nextValue.lat, nextValue.lng];
      setPosition(nextPosition);
      setFlyTarget(nextPosition);
      setSearchQuery(nextValue.address ?? place.display_name);
      setSearchResults([]);
      setStatusMessage(t('uiBits.placeSelected'));
      setErrorMessage(null);
      onChange(nextValue);
    },
    [onChange],
  );

  const handleUseMyLocation = useCallback(() => {
    // The Geolocation API is gated behind a secure context. The hostname
    // exception (localhost) lets dev work, but production over plain HTTP
    // or through a misconfigured proxy will throw before the prompt shows.
    const isSecure =
      typeof window !== 'undefined' &&
      (window.isSecureContext ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1');

    if (!isSecure) {
      setErrorMessage(
        'Browser geolocation needs HTTPS. Use the map or search to pick a place.',
      );
      return;
    }

    if (!navigator.geolocation) {
      setErrorMessage(
        "This browser doesn't support geolocation. Use the search box or click the map.",
      );
      return;
    }

    setIsLocating(true);
    setErrorMessage(null);
    setStatusMessage(t('uiBits.requestingLocation'));

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        commitPosition(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        setIsLocating(false);
        // GeolocationPositionError codes:
        //   1 PERMISSION_DENIED     — user (or page policy) blocked us
        //   2 POSITION_UNAVAILABLE  — sensor problem
        //   3 TIMEOUT               — we hit the timeout option below
        let msg: string;
        switch (err.code) {
          case err.PERMISSION_DENIED:
            msg =
              'Location permission is blocked. Enable it in the browser ' +
              'site settings, or pick a place on the map instead.';
            break;
          case err.POSITION_UNAVAILABLE:
            msg =
              "Couldn't determine your position right now. " +
              'Try again or pick a place on the map.';
            break;
          case err.TIMEOUT:
            msg =
              'Locating took too long. Check your connection and try ' +
              'again, or pick a place on the map.';
            break;
          default:
            msg = `Geolocation failed (${err.message || 'unknown error'}).`;
        }
        setStatusMessage(null);
        setErrorMessage(msg);
      },
      // High accuracy is worth the battery hit for a one-shot picker; 12 s
      // is generous enough that GPS-first phones don't false-timeout.
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60_000 },
    );
  }, [commitPosition]);

  const handleClear = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setStatusMessage(null);
    setErrorMessage(null);
    setPosition(DEFAULT_POSITION);
    setFlyTarget(DEFAULT_POSITION);
    onChange({ lat: 0, lng: 0 });
  }, [onChange]);

  const fmtCoord = (n: number) => n.toFixed(6);

  return (
    <div className={className}>
      <div className="overflow-hidden rounded-lg border bg-background">
        <div className="border-b bg-muted/20 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Clinic map location</p>
              <p className="text-xs text-muted-foreground">
                Search, click the map, or drag the marker to choose the clinic.
              </p>
            </div>
            {value && value.lat !== 0 && value.lng !== 0 && (
              <div className="flex shrink-0 items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                <Check className="h-3.5 w-3.5" />
                Selected
              </div>
            )}
          </div>

          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder={t('uiBits.searchPlace')}
              className="bg-background pl-9 pr-10"
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>

          {searchResults.length > 0 && (
            <div className="mt-2 max-h-44 overflow-auto rounded-md border bg-background shadow-sm">
              {searchResults.map((place) => (
                <button
                  key={place.place_id}
                  type="button"
                  onClick={() => handleSelectPlace(place)}
                  className="flex w-full items-start gap-2 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted/60"
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="line-clamp-2">{place.display_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="h-[320px] w-full bg-muted/20 md:h-[380px]">
          <LocationPickerMap
            position={position}
            flyTarget={flyTarget}
            onPositionChange={(lat, lng) => commitPosition(lat, lng)}
          />
        </div>

        <div className="space-y-3 border-t bg-muted/20 p-3">
          {(errorMessage || statusMessage) && (
            <div
              className={
                errorMessage
                  ? 'flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive'
                  : 'flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300'
              }
            >
              {errorMessage ? (
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : (
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              )}
              <span>{errorMessage ?? statusMessage}</span>
            </div>
          )}

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Coordinates
              </p>
              <p className="font-mono text-xs font-medium">
                {fmtCoord(position[0])}, {fmtCoord(position[1])}
              </p>
              {value?.address && (
                <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                  {value.address}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleUseMyLocation}
                disabled={isLocating}
              >
                {isLocating ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Locate className="mr-2 h-3.5 w-3.5" />
                )}
                {isLocating ? 'Locating...' : 'Use My Location'}
              </Button>

              {googleMapsUrl && (
                <Button type="button" variant="outline" size="sm" asChild>
                  <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-3.5 w-3.5" />
                    Maps
                  </a>
                </Button>
              )}

              {value && (
                <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
                  <X className="mr-2 h-3.5 w-3.5" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
