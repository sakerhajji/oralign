"use client";

/**
 * PractitionerMap — the inner Leaflet map for the public finder.
 *
 * IMPORTANT: import this ONLY through `next/dynamic({ ssr: false })`. Leaflet
 * touches `window` at module load, so it must never run on the server.
 *
 * Markers are brand-styled `L.divIcon`s (inline SVG) rather than the default
 * PNG sprites — this keeps everything self-contained (no CDN image fetch) and
 * lets the pins wear the showcase amber. A distinct blue dot marks the visitor.
 */

import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { PublicPractitioner } from "../../_lib/finder";

type LatLng = [number, number];

/** Practitioner pin — amber teardrop; `active` darkens + enlarges it. */
function pinIcon(active: boolean): L.DivIcon {
  const fill = active ? "#191919" : "#feca16";
  const stroke = active ? "#feca16" : "#191919";
  const size = active ? 42 : 34;
  const dot = active ? "#feca16" : "#191919";
  return L.divIcon({
    className: "sc-finder-pin",
    html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,0.35))">
      <path d="M12 1.5c-4.5 0-8 3.4-8 7.8 0 5.4 7 12.6 7.3 12.9a1 1 0 0 0 1.4 0C13 21.9 20 14.7 20 9.3c0-4.4-3.5-7.8-8-7.8Z" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>
      <circle cx="12" cy="9.2" r="3" fill="${dot}"/>
    </svg>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size + 6],
  });
}

/** Visitor position marker — pulsing blue dot. */
function userIcon(): L.DivIcon {
  return L.divIcon({
    className: "sc-finder-user",
    html: `<span style="display:block;width:18px;height:18px;border-radius:9999px;background:#2563eb;border:3px solid #f2f5ef;box-shadow:0 0 0 4px rgba(37,99,235,0.25)"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

/**
 * Imperative viewport controller. `focus` (a selected practitioner or the
 * visitor) always wins; otherwise the map fits all markers once per dataset.
 */
function MapEffects({
  focus,
  bounds,
  boundsKey,
}: {
  focus: LatLng | null;
  bounds: LatLng[];
  boundsKey: string;
}) {
  const map = useMap();
  const lastFocus = useRef<string>("");
  const lastFit = useRef<string>("");

  useEffect(() => {
    if (!focus) return;
    const key = `${focus[0].toFixed(5)},${focus[1].toFixed(5)}`;
    if (lastFocus.current === key) return;
    lastFocus.current = key;
    map.flyTo(focus, Math.max(map.getZoom(), 13), { animate: true, duration: 0.8 });
  }, [focus, map]);

  useEffect(() => {
    if (focus) return; // don't fight an active focus
    if (bounds.length === 0) return;
    if (lastFit.current === boundsKey) return;
    lastFit.current = boundsKey;
    if (bounds.length === 1) {
      map.setView(bounds[0], 13, { animate: false });
    } else {
      map.fitBounds(bounds, { padding: [42, 42], maxZoom: 13, animate: false });
    }
  }, [bounds, boundsKey, focus, map]);

  return null;
}

export interface PractitionerMapProps {
  practitioners: PublicPractitioner[];
  userPosition: LatLng | null;
  selectedId: string | null;
  focus: LatLng | null;
  userLabel: string;
  onSelect: (id: string) => void;
}

export default function PractitionerMap({
  practitioners,
  userPosition,
  selectedId,
  focus,
  userLabel,
  onSelect,
}: PractitionerMapProps) {
  // Only practitioners that carry real coordinates can be mapped.
  const located = useMemo(
    () =>
      practitioners.filter(
        (p): p is PublicPractitioner & { latitude: number; longitude: number } =>
          typeof p.latitude === "number" && typeof p.longitude === "number",
      ),
    [practitioners],
  );

  const bounds = useMemo<LatLng[]>(() => {
    const pts: LatLng[] = located.map((p) => [p.latitude, p.longitude]);
    if (userPosition) pts.push(userPosition);
    return pts;
  }, [located, userPosition]);

  // Changes only when the mappable set (or the user dot) changes → refit once.
  const boundsKey = useMemo(
    () => `${located.map((p) => p.id).join(",")}|${userPosition ? "u" : ""}`,
    [located, userPosition],
  );

  return (
    <MapContainer
      center={[34.0, 9.5]}
      zoom={6}
      scrollWheelZoom
      style={{ width: "100%", height: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapEffects focus={focus} bounds={bounds} boundsKey={boundsKey} />

      {userPosition && (
        <Marker position={userPosition} icon={userIcon()} zIndexOffset={1000}>
          <Popup>{userLabel}</Popup>
        </Marker>
      )}

      {located.map((p) => (
        <Marker
          key={p.id}
          position={[p.latitude, p.longitude]}
          icon={pinIcon(p.id === selectedId)}
          eventHandlers={{ click: () => onSelect(p.id) }}
        >
          <Popup>
            <span style={{ fontWeight: 600 }}>{p.practitionerName}</span>
            <br />
            {p.clinicName}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
