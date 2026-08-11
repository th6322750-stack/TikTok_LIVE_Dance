/**
 * Deterministic fake audience.
 *
 * Same index → same user, every run. Determinism here is what lets a replay of the same fixture
 * produce a byte-identical canonical state (Task 03 acceptance).
 */

export interface SimulatedUser {
  readonly userId: string;
  readonly handle: string;
  readonly displayName: string;
  readonly avatar: string;
}

const NAMES = [
  'Mai Anh',
  'Bảo Long',
  'Cẩm Tú',
  'Duy Khánh',
  'Gia Hân',
  'Hoàng Nam',
  'Kim Ngân',
  'Lan Chi',
  'Minh Quân',
  'Ngọc Diệp',
  'Phương Vy',
  'Quốc Bảo',
  'Thanh Trúc',
  'Tuấn Kiệt',
  'Vân Khánh',
] as const;

/** Stable synthetic user for a given index. */
export function simulatedUser(index: number): SimulatedUser {
  const safeIndex = Math.abs(Math.trunc(index));
  const name = NAMES[safeIndex % NAMES.length] ?? 'Dancer';
  const id = `sim-user-${String(safeIndex + 1).padStart(3, '0')}`;

  return {
    userId: id,
    handle: `sim_${safeIndex + 1}`,
    displayName: `${name} ${safeIndex + 1}`,
    avatar: `https://avatars.dance-arena.test/${id}.webp`,
  };
}

export function simulatedAudience(count: number): SimulatedUser[] {
  return Array.from({ length: Math.max(0, count) }, (_unused, index) => simulatedUser(index));
}
