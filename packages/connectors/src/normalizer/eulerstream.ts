/**
 * EulerStream normalizer (Blueprint §9, §12, §76).
 *
 * This is the ONLY module allowed to know EulerStream/TikTok field names. It reads defensively
 * (schemas drift between message versions) and then validates the RESULT against the contract, so
 * whatever leaves this file is either a valid contract v1 event or nothing at all.
 *
 * Identity rule: a payload without a stable platform user id is REJECTED. Falling back to a
 * nickname would silently merge different people into one player (Blueprint §10).
 */

import {
  LiveEventSchema,
  normalizeCommentText,
  type LiveEvent,
  type LiveUser,
  type RawLiveEvent,
} from '@dance-arena/contracts';

import {
  asRecord,
  readBoolean,
  readNumber,
  readRawString,
  readRecord,
  readString,
  toCount,
} from './fieldReaders.js';
import { ignored, invalid, type EventNormalizer, type NormalizeResult } from './types.js';

/** Provider message kinds mapped to our six normalized event types (Blueprint §9). */
const COMMENT_KINDS = new Set(['chat', 'comment', 'WebcastChatMessage']);
const GIFT_KINDS = new Set(['gift', 'WebcastGiftMessage']);
const SOCIAL_KINDS = new Set(['social', 'follow', 'share', 'WebcastSocialMessage']);
const JOIN_KINDS = new Set(['member', 'join', 'WebcastMemberMessage']);
const LIKE_KINDS = new Set(['like', 'WebcastLikeMessage']);

/** Frames that are expected but carry no gameplay meaning. */
const IGNORED_KINDS = new Set([
  'roomUser',
  'roomStats',
  'viewer',
  'connected',
  'disconnected',
  'streamEnd',
  'error',
  'ping',
  'pong',
  'heartbeat',
  'subscribe',
  'WebcastRoomUserSeqMessage',
]);

export class EulerStreamNormalizer implements EventNormalizer {
  readonly provider = 'eulerstream';

  normalize(raw: RawLiveEvent): NormalizeResult {
    if (raw.provider !== 'eulerstream') return ignored(`unsupported provider ${raw.provider}`);
    if (IGNORED_KINDS.has(raw.kind)) return ignored(`non-gameplay frame ${raw.kind}`);

    const payload = asRecord(raw.payload);
    if (payload === undefined) return invalid(`payload for ${raw.kind} is not an object`);

    const user = readUser(payload);
    if (user === undefined) {
      return invalid(`payload for ${raw.kind} has no stable platform user id`);
    }

    const timestamp = readTimestamp(payload, raw.receivedAt);
    const candidate = buildEvent(raw.kind, payload, user, timestamp);

    if (candidate === undefined) return ignored(`unmapped message kind ${raw.kind}`);

    // Final gate: nothing leaves the boundary unless it satisfies contract v1.
    const parsed = LiveEventSchema.safeParse(candidate);
    if (!parsed.success) {
      return invalid(
        parsed.error.issues
          .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
          .join('; '),
      );
    }

    return { ok: true, event: parsed.data };
  }
}

function buildEvent(
  kind: string,
  payload: Record<string, unknown>,
  user: LiveUser,
  timestamp: number,
): LiveEvent | undefined {
  if (COMMENT_KINDS.has(kind)) {
    // Raw comment text is preserved verbatim; only `normalizedComment` is cleaned up.
    const comment = readRawString(payload, 'comment', 'content', 'text', 'message') ?? '';
    return {
      version: 1,
      type: 'comment',
      timestamp,
      user,
      comment,
      normalizedComment: normalizeCommentText(comment),
    };
  }

  if (GIFT_KINDS.has(kind)) {
    return buildGiftEvent(payload, user, timestamp);
  }

  if (SOCIAL_KINDS.has(kind)) {
    const social = resolveSocialKind(kind, payload);
    if (social === undefined) return undefined;

    return { version: 1, type: social, timestamp, user };
  }

  if (JOIN_KINDS.has(kind)) {
    return { version: 1, type: 'join', timestamp, user };
  }

  if (LIKE_KINDS.has(kind)) {
    const likeCount = toCount(readNumber(payload, 'likeCount', 'count', 'like_count'), 1);
    const totalLikeCount = readNumber(payload, 'totalLikeCount', 'total_like_count');

    return {
      version: 1,
      type: 'like',
      timestamp,
      user,
      likeCount,
      ...(totalLikeCount === undefined ? {} : { totalLikeCount: toCount(totalLikeCount) }),
    };
  }

  return undefined;
}

/**
 * Gift extraction (Blueprint §12/§13).
 *
 * Keeps everything deduplication needs: transaction id, repeat count and the streak flags. The
 * engine — not this adapter — decides how many diamonds that translates into.
 */
function buildGiftEvent(
  payload: Record<string, unknown>,
  user: LiveUser,
  timestamp: number,
): LiveEvent {
  const giftDetails = readRecord(payload, 'gift', 'giftDetails', 'giftInfo');

  const name =
    readString(payload, 'giftName', 'gift_name', 'gift.name', 'giftDetails.giftName', 'name') ??
    readString(giftDetails, 'name', 'giftName') ??
    'Gift';

  const id =
    readString(payload, 'giftId', 'gift_id', 'gift.id', 'gift.gift_id') ??
    readString(giftDetails, 'id', 'giftId', 'gift_id');

  const diamondValue = toCount(
    readNumber(
      payload,
      'diamondCount',
      'diamond_count',
      'gift.diamond_count',
      'gift.diamondCount',
      'giftDetails.diamondCount',
      'cost',
    ) ?? readNumber(giftDetails, 'diamondCount', 'diamond_count', 'cost'),
  );

  const repeatCount = Math.max(
    1,
    toCount(readNumber(payload, 'repeatCount', 'repeat_count', 'gift.repeat_count', 'combo'), 1),
  );

  // `repeatEnd` true / `repeat_end` 1 means the combo just closed.
  const repeatEnd =
    readBoolean(payload, 'repeatEnd', 'repeat_end', 'gift.repeat_end') ??
    readBoolean(giftDetails, 'repeatEnd', 'repeat_end');

  // Gift type 1 is the streakable kind in the TikTok protocol; anything else is one-shot.
  const giftType = readNumber(payload, 'giftType', 'gift_type', 'gift.type', 'gift.gift_type');
  const streakable = giftType === undefined ? repeatEnd !== undefined : giftType === 1;

  const streakEnded = streakable ? (repeatEnd ?? true) : true;

  const transactionId = readString(
    payload,
    'msgId',
    'msg_id',
    'transactionId',
    'logId',
    'log_id',
    'groupId',
    'group_id',
  );

  const imageUrl =
    readString(payload, 'giftPictureUrl', 'gift.image', 'gift.icon.url_list.0') ??
    readString(giftDetails, 'image', 'pictureUrl');

  const reportedTotal = readNumber(payload, 'totalDiamonds', 'total_diamond_count');
  const totalDiamonds = toCount(reportedTotal ?? diamondValue * repeatCount);

  return {
    version: 1,
    type: 'gift',
    timestamp,
    user,
    gift: {
      name,
      diamondValue,
      repeatCount,
      totalDiamonds,
      streak: streakable && !streakEnded,
      streakEnded,
      ...(id === undefined ? {} : { id }),
      ...(transactionId === undefined ? {} : { transactionId }),
      ...(imageUrl === undefined ? {} : { imageUrl }),
    },
  };
}

/** `social` frames distinguish follow vs share through a display type string. */
function resolveSocialKind(
  kind: string,
  payload: Record<string, unknown>,
): 'follow' | 'share' | undefined {
  if (kind === 'follow') return 'follow';
  if (kind === 'share') return 'share';

  const displayType = readString(payload, 'displayType', 'display_type', 'label', 'action') ?? '';

  if (/follow/i.test(displayType)) return 'follow';
  if (/share/i.test(displayType)) return 'share';

  const actionId = readNumber(payload, 'action', 'actionId');
  if (actionId === 1) return 'follow';
  if (actionId === 3) return 'share';

  return undefined;
}

/**
 * User extraction. Identity comes from the platform id only — never the nickname (Blueprint §10).
 */
function readUser(payload: Record<string, unknown>): LiveUser | undefined {
  const userRecord = readRecord(payload, 'user', 'userInfo', 'from', 'sender') ?? payload;

  const platformUserId =
    readString(userRecord, 'userId', 'user_id', 'id', 'secUid', 'sec_uid') ??
    readString(payload, 'userId', 'user_id', 'secUid');

  if (platformUserId === undefined) return undefined;

  const nickname =
    readString(userRecord, 'nickname', 'nickName', 'displayName', 'display_name') ??
    readString(payload, 'nickname', 'nickName') ??
    '';

  const uniqueId = readString(userRecord, 'uniqueId', 'unique_id', 'handle', 'username');

  const avatarUrl =
    readString(
      userRecord,
      'profilePictureUrl',
      'profile_picture_url',
      'avatarThumb',
      'avatar_thumb.url_list.0',
      'avatarUrl',
    ) ?? readString(payload, 'profilePictureUrl', 'avatarUrl');

  return {
    platformUserId,
    nickname,
    ...(uniqueId === undefined ? {} : { uniqueId }),
    ...(avatarUrl === undefined ? {} : { avatarUrl }),
  };
}

function readTimestamp(payload: Record<string, unknown>, fallback: number): number {
  const value = readNumber(payload, 'timestamp', 'createTime', 'create_time', 'ts');
  if (value === undefined) return fallback;

  // Providers mix seconds and milliseconds; normalize to ms.
  const asMs = value < 1e12 ? value * 1000 : value;
  return Math.max(0, Math.trunc(asMs));
}
