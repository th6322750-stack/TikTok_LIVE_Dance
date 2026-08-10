/**
 * Logical slot system (Blueprint §22).
 *
 * The engine owns logical slots (`normal-01 … normal-30`, `vip-01 … vip-10`) and a normalized
 * 0..1 coordinate for each. STAGE is free to map the same slot ids to its own layout — it never
 * invents slot assignment itself.
 */

import type { DancerZone, NormalizedPosition, SlotDefinition } from '@dance-arena/contracts';

export class SlotAllocator {
  /** slotId → dancerId */
  private readonly occupancy = new Map<string, string>();

  constructor(private slots: readonly SlotDefinition[]) {}

  setSlots(slots: readonly SlotDefinition[]): void {
    this.slots = slots;
    for (const slotId of [...this.occupancy.keys()]) {
      if (!slots.some((slot) => slot.slotId === slotId)) this.occupancy.delete(slotId);
    }
  }

  /** First free slot of a zone, in declaration order — deterministic, never random. */
  findFreeSlot(zone: DancerZone): SlotDefinition | undefined {
    return this.slots.find((slot) => slot.zone === zone && !this.occupancy.has(slot.slotId));
  }

  findSlot(slotId: string): SlotDefinition | undefined {
    return this.slots.find((slot) => slot.slotId === slotId);
  }

  /** Slots of a zone in order, used for neighbour movement. */
  slotsOfZone(zone: DancerZone): SlotDefinition[] {
    return this.slots.filter((slot) => slot.zone === zone);
  }

  isFree(slotId: string): boolean {
    return !this.occupancy.has(slotId);
  }

  occupy(slotId: string, dancerId: string): void {
    this.occupancy.set(slotId, dancerId);
  }

  release(slotId: string): void {
    this.occupancy.delete(slotId);
  }

  releaseByDancer(dancerId: string): void {
    for (const [slotId, occupant] of this.occupancy) {
      if (occupant === dancerId) this.occupancy.delete(slotId);
    }
  }

  reset(): void {
    this.occupancy.clear();
  }

  get occupiedCount(): number {
    return this.occupancy.size;
  }
}

export function positionOf(slot: SlotDefinition): NormalizedPosition {
  return { x: slot.x, y: slot.y };
}

/**
 * Neighbour slot for a movement command.
 *
 * The default layout is a 6-column grid, so LEFT/RIGHT step by one and DOWN steps by one row.
 * Returns undefined at the edge of the zone.
 */
export function neighbourSlot(
  slots: readonly SlotDefinition[],
  currentSlotId: string,
  direction: 'left' | 'right' | 'down',
  columns: number,
): SlotDefinition | undefined {
  const index = slots.findIndex((slot) => slot.slotId === currentSlotId);
  if (index < 0) return undefined;

  const targetIndex =
    direction === 'left' ? index - 1 : direction === 'right' ? index + 1 : index + columns;

  if (targetIndex < 0 || targetIndex >= slots.length) return undefined;

  return slots[targetIndex];
}
