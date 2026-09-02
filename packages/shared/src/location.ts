export interface LocationMessageContent {
  type: 'location';
  title: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  mapsUrl: string;
}

type LocationSource = {
  title?: string | null;
  address?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
};

function toOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toCoord(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function isValidLatLng(latitude: number, longitude: number): boolean {
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

export function buildGoogleMapsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

export function createLocationMessageContent(
  message: LocationSource,
): LocationMessageContent | null {
  const latitude = toCoord(message.latitude);
  const longitude = toCoord(message.longitude);
  if (latitude === null || longitude === null || !isValidLatLng(latitude, longitude)) {
    return null;
  }
  return {
    type: 'location',
    title: toOptionalText(message.title),
    address: toOptionalText(message.address),
    latitude,
    longitude,
    mapsUrl: buildGoogleMapsUrl(latitude, longitude),
  };
}

export function parseLocationMessageContent(content: string): LocationMessageContent | null {
  try {
    const parsed = JSON.parse(content) as Partial<LocationMessageContent> & LocationSource;
    return createLocationMessageContent(parsed);
  } catch {
    return null;
  }
}

export function locationPreviewLabel(content?: string | null): string {
  if (!content) return '📍 位置情報';
  const parsed = parseLocationMessageContent(content);
  if (parsed?.title) return `📍 ${parsed.title}`;
  const legacy = content.match(/^\[位置情報(?::\s*(.+))?\]$/);
  if (legacy?.[1]) return `📍 ${legacy[1]}`;
  return '📍 位置情報';
}
