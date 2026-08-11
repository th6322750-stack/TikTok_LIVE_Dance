/**
 * Named scenarios — reproducible mini LIVE sessions.
 *
 * A scenario is pure data: offsets + mock payloads. It can be pushed through MockConnector live,
 * or serialized into a recorded session and replayed (Blueprint §53/§54).
 */

import type { MockPayload } from '@dance-arena/connectors';

import {
  commentPayload,
  followPayload,
  giftPayload,
  giftStreakPayloads,
  joinPayload,
  likePayload,
  sharePayload,
} from './payloads.js';
import { simulatedUser } from './users.js';

export interface ScenarioStep {
  /** Milliseconds since scenario start. */
  readonly at: number;
  readonly payload: MockPayload;
}

export interface Scenario {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly steps: readonly ScenarioStep[];
}

const step = (at: number, payload: MockPayload): ScenarioStep => ({ at, payload });

/** The Blueprint §73 milestone-1 chain: GO → dancer, then a 500 diamond gift → rank + FX. */
function joinAndGiftScenario(): Scenario {
  const user = simulatedUser(0);
  const supporter = simulatedUser(1);

  return {
    id: 'join-and-gift',
    title: 'Join and gift',
    description: 'One viewer joins the stage, another outspends them and takes rank 1.',
    steps: [
      step(0, joinPayload(user, 0)),
      step(200, commentPayload(user, 'GO', 200)),
      step(600, joinPayload(supporter, 600)),
      step(800, commentPayload(supporter, 'vào', 800)),
      step(1_500, giftPayload(user, 1_500, { diamonds: 99, transactionId: 'sim-tx-1' })),
      step(2_500, giftPayload(supporter, 2_500, { diamonds: 500, transactionId: 'sim-tx-2' })),
      step(3_000, followPayload(supporter, 3_000)),
      step(3_400, sharePayload(user, 3_400)),
      step(3_800, likePayload(user, 3_800, 12)),
    ],
  };
}

/** Exercises the deduplication rule end to end. */
function giftStreakScenario(): Scenario {
  const user = simulatedUser(2);

  return {
    id: 'gift-streak',
    title: 'Gift streak',
    description: 'A x4 combo that must credit 4 repeats, never 1+2+3+4.',
    steps: [
      step(0, commentPayload(user, 'GO', 0)),
      ...giftStreakPayloads(user, 500, {
        diamonds: 25,
        repeats: 4,
        transactionId: 'sim-streak-1',
      }).map((payload) => step(payload.at, payload)),
    ],
  };
}

/** Fills the stage and overflows into the queue. */
function crowdScenario(): Scenario {
  const steps: ScenarioStep[] = [];

  for (let index = 0; index < 35; index += 1) {
    const user = simulatedUser(index);
    const at = index * 120;
    steps.push(step(at, joinPayload(user, at)));
    steps.push(step(at + 40, commentPayload(user, 'GO', at + 40)));
  }

  return {
    id: 'crowd',
    title: 'Crowd',
    description: '35 viewers join: 30 dancers spawn, the rest queue.',
    steps,
  };
}

/** Every gift tier in one run, for FX verification. */
function giftTierSweepScenario(): Scenario {
  const user = simulatedUser(3);
  const amounts = [1, 25, 99, 500, 1_500];

  return {
    id: 'gift-tiers',
    title: 'Gift tier sweep',
    description: 'One gift per tier: 1, 25, 99, 500 and 1500 diamonds.',
    steps: [
      step(0, commentPayload(user, 'GO', 0)),
      ...amounts.map((diamonds, index) => {
        const at = 500 + index * 800;
        return step(at, giftPayload(user, at, { diamonds, transactionId: `sim-tier-${index}` }));
      }),
    ],
  };
}

export const SCENARIOS: readonly Scenario[] = [
  joinAndGiftScenario(),
  giftStreakScenario(),
  crowdScenario(),
  giftTierSweepScenario(),
];

export function findScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((scenario) => scenario.id === id);
}
