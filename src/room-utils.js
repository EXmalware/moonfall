export const DEFAULT_ROOM_NAME = 'Desa Cahaya Bulan';

export function sanitizeRoomName(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return DEFAULT_ROOM_NAME;
  return trimmed.slice(0, 40);
}
