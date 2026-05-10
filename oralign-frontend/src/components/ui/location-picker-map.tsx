'use client';

/**
 * LocationPickerMap — inner Leaflet component.
 *
 * IMPORTANT: This file must only be imported via next/dynamic with { ssr: false }
 * because Leaflet accesses `window` on import.
 */

import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// ─── Fix broken default icons (webpack strips the image imports) ─────────────
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ─── Sub-components ──────────────────────────────────────────────────────────

/** Forwards map click events to the parent as lat/lng. */
function ClickHandler({ onMove }: { onMove: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onMove(e.latlng.lat, e.latlng.lng) });
  return null;
}

/**
 * Imperatively flies the map viewport to `target` whenever the reference
 * changes (e.g., after a geolocation success). Skips identical positions to
 * avoid infinite loops caused by click-then-fly sequences.
 */
function FlyToController({ target }: { target: [number, number] | null }) {
  const map = useMap();
  const prev = useRef<string>('');

  useEffect(() => {
    if (!target) return;
    const key = `${target[0].toFixed(6)},${target[1].toFixed(6)}`;
    if (prev.current === key) return;
    prev.current = key;
    map.flyTo(target, 15, { animate: true, duration: 0.8 });
  }, [target, map]);

  return null;
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface LocationPickerMapProps {
  /** Current marker position (controlled by parent). */
  position: [number, number];
  /**
   * When this changes to a new value the map flies there.
   * Typically set after geolocation success.
   */
  flyTarget: [number, number] | null;
  onPositionChange: (lat: number, lng: number) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function LocationPickerMap({
  position,
  flyTarget,
  onPositionChange,
}: LocationPickerMapProps) {
  const markerRef = useRef<L.Marker>(null);

  // Sync drag-end back to parent
  const markerEventHandlers = {
    dragend() {
      const latlng = markerRef.current?.getLatLng();
      if (latlng) onPositionChange(latlng.lat, latlng.lng);
    },
  };

  return (
    <MapContainer
      center={position}
      zoom={13}
      scrollWheelZoom
      style={{ width: '100%', height: '100%' }}
      className="rounded-lg"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Click to move marker */}
      <ClickHandler onMove={onPositionChange} />

      {/* Fly to geolocation target */}
      <FlyToController target={flyTarget} />

      {/* Draggable marker */}
      <Marker
        position={position}
        draggable
        ref={markerRef}
        eventHandlers={markerEventHandlers}
      />
    </MapContainer>
  );
}
