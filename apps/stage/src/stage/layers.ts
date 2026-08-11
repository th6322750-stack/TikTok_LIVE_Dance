/**
 * Fixed layer stack (Blueprint §28).
 *
 * Z-order is declared once, in order, and never computed at runtime. Adding a visual element means
 * choosing an existing layer — not sorting sprites ad hoc.
 */

export const STAGE_LAYERS = [
  'background',
  'dj',
  'environment',
  'normalDancer',
  'vip',
  'particle',
  'giftFx',
  'overlay',
  'announcement',
] as const;

export type StageLayerName = (typeof STAGE_LAYERS)[number];

/** Z index of a layer; lower renders first. */
export function layerIndex(layer: StageLayerName): number {
  return STAGE_LAYERS.indexOf(layer);
}
