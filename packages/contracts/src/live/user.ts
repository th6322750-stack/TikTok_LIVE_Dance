/**
 * Live user identity (Blueprint §10).
 *
 * IDENTITY RULE: `platformUserId` is the one and only identity. Nickname is display data —
 * it can be changed by the user and can collide between users, so nothing in the system may key
 * on it. `uniqueId` (the @handle) is stable-ish but still user-changeable, so it is display data
 * too.
 */

import { z } from 'zod';

import { NonEmptyStringSchema } from '../common.js';

export const LiveUserSchema = z.object({
  /** Stable platform-assigned id. The ONLY valid identity key. */
  platformUserId: NonEmptyStringSchema,
  /** Public @handle. Display/lookup only — never an identity. */
  uniqueId: z.string().optional(),
  /** Display name. Never an identity (Blueprint §10). */
  nickname: z.string(),
  avatarUrl: z.string().optional(),
});

export type LiveUser = z.infer<typeof LiveUserSchema>;

/** Best-effort display label; never use the result as a key. */
export function displayNameOf(user: LiveUser): string {
  const nickname = user.nickname.trim();
  if (nickname.length > 0) return nickname;

  const uniqueId = user.uniqueId?.trim();
  if (uniqueId !== undefined && uniqueId.length > 0) return uniqueId;

  return user.platformUserId;
}
