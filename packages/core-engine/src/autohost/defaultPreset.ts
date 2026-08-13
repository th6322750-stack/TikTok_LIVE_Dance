/**
 * Default Vietnamese host preset (Task 10 §5).
 *
 * PURE DATA. There is not a single `if` here: behaviour differences (small vs high vs mega gift,
 * top-3 vs VIP promotion) are expressed as conditions and priorities, so an operator can retune the
 * host without a code change and a reviewer can read the whole host policy in one place.
 *
 * Deliberate choices
 * - Join and accepted GO/JOIN produce VISUALS only. Speaking on every join is the fastest way to
 *   make a LIVE unwatchable, and speaking a comment would mean speaking arbitrary viewer text.
 * - No gift rule emits `SHOW_EFFECT`: the GiftEngine already plays the tier effect, and Auto Host
 *   must not double it (§5 "Do not duplicate the existing GiftEngine gift FX").
 * - Gift rules are separated by tier, so exactly one of them can match a given gift.
 * - The two promotion rules share the `rank-celebration` cooldown group, so a viewer who reaches
 *   Top-3 and the VIP zone in the same ranking update gets ONE celebration, not two. Party goal
 *   keeps its own budget so it can never be swallowed by an unrelated rank change.
 * - `comment-keywords` reacts to a fixed keyword list with a visual only; it never reads the
 *   comment aloud (§10.7).
 */

import type { AutoHostConfig, AutoHostRule } from '@dance-arena/contracts';

/** Blueprint §51 priority order, expressed as rule priorities. */
const PRIORITY = {
  megaGift: 90,
  highGift: 80,
  partyGoal: 70,
  rankPromotion: 60,
  vipPromotion: 55,
  smallGift: 50,
  follow: 40,
  share: 35,
  command: 30,
  comment: 20,
  join: 15,
  reminder: 10,
} as const;

export const VIETNAMESE_DEFAULT_RULES: readonly AutoHostRule[] = [
  {
    ruleId: 'join-welcome-bubble',
    description: 'Bong bóng chào mừng khi có người vào LIVE (không đọc TTS để tránh spam).',
    enabled: true,
    trigger: 'live:join',
    priority: PRIORITY.join,
    conditions: [],
    cooldown: { globalMs: 1_500, perUserMs: 600_000 },
    actions: [{ type: 'SHOW_BUBBLE', variant: 'join', durationMs: 2_500 }],
  },

  {
    ruleId: 'command-go-bubble',
    description: 'Lệnh GO/VÀO được Core chấp nhận → bong bóng "go" cạnh dancer.',
    enabled: true,
    trigger: 'game:command-accepted',
    priority: PRIORITY.command,
    conditions: [{ type: 'command-in', commands: ['JOIN_STAGE'] }],
    cooldown: { globalMs: 500, perUserMs: 5_000 },
    actions: [{ type: 'SHOW_BUBBLE', variant: 'go', durationMs: 2_200 }],
  },

  {
    ruleId: 'command-vip-bubble',
    description: 'Lệnh VIP được chấp nhận → bong bóng "vip" + reaction.',
    enabled: true,
    trigger: 'game:command-accepted',
    priority: PRIORITY.command,
    conditions: [{ type: 'command-in', commands: ['MOVE_VIP'] }],
    cooldown: { globalMs: 800, perUserMs: 10_000 },
    actions: [
      { type: 'SHOW_BUBBLE', variant: 'vip', durationMs: 2_500 },
      { type: 'SHOW_REACTION', variant: 'wow', durationMs: 1_800 },
    ],
  },

  {
    ruleId: 'comment-keywords',
    description:
      'Phản ứng hình ảnh với một danh sách từ khoá cố định. Không bao giờ đọc nội dung comment.',
    enabled: true,
    trigger: 'live:comment',
    priority: PRIORITY.comment,
    // Matched against the already-normalized comment (uppercase, diacritics stripped).
    conditions: [{ type: 'comment-contains', values: ['GG', 'HAY QUA', 'TUYET', 'DINH QUA'] }],
    cooldown: { globalMs: 5_000, perUserMs: 30_000 },
    actions: [{ type: 'SHOW_REACTION', variant: 'gg', durationMs: 1_800 }],
  },

  {
    ruleId: 'follow-thanks',
    description: 'Cảm ơn follow: announcement + bong bóng + TTS ưu tiên thường.',
    enabled: true,
    trigger: 'live:follow',
    priority: PRIORITY.follow,
    conditions: [],
    cooldown: { globalMs: 4_000, perUserMs: 600_000 },
    actions: [
      {
        type: 'SHOW_ANNOUNCEMENT',
        template: 'Cảm ơn {user.nickname} đã follow!',
        level: 'info',
        durationMs: 3_500,
      },
      { type: 'SHOW_BUBBLE', variant: 'follow', durationMs: 2_200 },
      { type: 'TTS', template: 'Cảm ơn {user.nickname} đã follow!', priority: 'normal' },
    ],
  },

  {
    ruleId: 'share-thanks',
    description: 'Cảm ơn share, cooldown toàn cục dài để chặn spam share.',
    enabled: true,
    trigger: 'live:share',
    priority: PRIORITY.share,
    conditions: [],
    cooldown: { globalMs: 20_000, perUserMs: 900_000 },
    actions: [
      {
        type: 'SHOW_ANNOUNCEMENT',
        template: 'Cảm ơn {user.nickname} đã chia sẻ LIVE!',
        level: 'info',
        durationMs: 3_500,
      },
      { type: 'SHOW_BUBBLE', variant: 'share', durationMs: 2_200 },
      { type: 'TTS', template: 'Cảm ơn {user.nickname} đã chia sẻ LIVE!', priority: 'normal' },
    ],
  },

  {
    ruleId: 'gift-small-thanks',
    description: 'Quà nhỏ (tier 1–3): cảm ơn nhẹ, TTS ưu tiên thấp, không thêm hiệu ứng quà.',
    enabled: true,
    trigger: 'live:gift',
    priority: PRIORITY.smallGift,
    conditions: [{ type: 'gift-tier-in', tierIds: ['tier-1', 'tier-2', 'tier-3'] }],
    cooldown: { globalMs: 2_500, perUserMs: 15_000 },
    actions: [
      {
        type: 'SHOW_ANNOUNCEMENT',
        template: '{user.nickname} tặng {gift.name} ({gift.diamonds} kim cương)',
        level: 'info',
        durationMs: 3_000,
      },
      { type: 'SHOW_BUBBLE', variant: 'thank-you', durationMs: 2_000 },
      { type: 'TTS', template: 'Cảm ơn {user.nickname} đã tặng {gift.name}!', priority: 'low' },
    ],
  },

  {
    ruleId: 'gift-high-thanks',
    description: 'Quà lớn (tier 4): announcement celebration + TTS ưu tiên cao + spotlight.',
    enabled: true,
    trigger: 'live:gift',
    priority: PRIORITY.highGift,
    conditions: [{ type: 'gift-tier-in', tierIds: ['tier-4'] }],
    cooldown: { globalMs: 1_500 },
    actions: [
      {
        type: 'SHOW_ANNOUNCEMENT',
        template: '{user.nickname} vừa tặng {gift.name} — {gift.diamonds} kim cương!',
        level: 'celebration',
        durationMs: 5_000,
      },
      { type: 'SHOW_REACTION', variant: 'love', durationMs: 2_500 },
      {
        type: 'TTS',
        template: 'Cảm ơn {user.nickname} đã tặng {gift.name} {gift.diamonds} kim cương!',
        priority: 'high',
      },
      { type: 'START_SPOTLIGHT', durationMs: 6_000 },
    ],
  },

  {
    ruleId: 'gift-mega-thanks',
    description: 'Quà cực lớn (tier 5): TTS ưu tiên critical + spotlight dài.',
    enabled: true,
    trigger: 'live:gift',
    priority: PRIORITY.megaGift,
    conditions: [{ type: 'gift-tier-in', tierIds: ['tier-5'] }],
    cooldown: { globalMs: 1_000 },
    actions: [
      {
        type: 'SHOW_ANNOUNCEMENT',
        template: 'SIÊU QUÀ! {user.nickname} tặng {gift.name} — {gift.diamonds} kim cương!',
        level: 'celebration',
        durationMs: 6_000,
      },
      { type: 'SHOW_REACTION', variant: 'fire', durationMs: 3_000 },
      {
        type: 'TTS',
        template: 'Siêu quà! Cảm ơn {user.nickname} đã tặng {gift.name} {gift.diamonds} kim cương!',
        priority: 'critical',
      },
      { type: 'START_SPOTLIGHT', durationMs: 8_000 },
    ],
  },

  {
    ruleId: 'party-goal-celebration',
    description: 'Party goal hoàn thành: celebration + hiệu ứng host + TTS ưu tiên cao.',
    enabled: true,
    trigger: 'game:party-goal-complete',
    priority: PRIORITY.partyGoal,
    conditions: [],
    // Deliberately NOT in the rank-celebration group: a completed party goal is the headline
    // moment of a session and must never be swallowed because someone also changed rank.
    cooldown: { globalMs: 8_000 },
    actions: [
      {
        type: 'SHOW_ANNOUNCEMENT',
        template: 'PARTY GOAL HOÀN THÀNH! Mục tiêu tiếp theo: {partyGoal.target} kim cương',
        level: 'celebration',
        durationMs: 5_000,
      },
      { type: 'SHOW_EFFECT', slot: 'celebration', durationMs: 3_000 },
      { type: 'SHOW_BUBBLE', variant: 'party-goal', durationMs: 2_500 },
      {
        type: 'TTS',
        template: 'Party goal đã hoàn thành! Cả nhà quá tuyệt vời!',
        priority: 'high',
      },
    ],
  },

  {
    ruleId: 'rank-promotion-top3',
    description: 'Chỉ bắn khi thực sự tiến vào Top 3 (không bắn lại mỗi lần ranking refresh).',
    enabled: true,
    trigger: 'game:rank-promotion',
    priority: PRIORITY.rankPromotion,
    conditions: [{ type: 'rank-entered-top', rank: 3 }],
    cooldown: { globalMs: 8_000, perUserMs: 120_000, group: 'rank-celebration' },
    actions: [
      {
        type: 'SHOW_ANNOUNCEMENT',
        template: '{user.nickname} vươn lên hạng {rank.current}!',
        level: 'celebration',
        durationMs: 4_000,
      },
      { type: 'SHOW_REACTION', variant: 'cheer', durationMs: 2_200 },
      { type: 'TTS', template: '{user.nickname} vừa lên hạng {rank.current}!', priority: 'high' },
    ],
  },

  {
    ruleId: 'vip-promotion',
    description: 'Vào khu VIP: bong bóng VIP + TTS thường. Cùng nhóm cooldown với celebration.',
    enabled: true,
    trigger: 'game:rank-promotion',
    priority: PRIORITY.vipPromotion,
    conditions: [{ type: 'entered-vip' }],
    cooldown: { globalMs: 8_000, perUserMs: 120_000, group: 'rank-celebration' },
    actions: [
      {
        type: 'SHOW_ANNOUNCEMENT',
        template: '{user.nickname} đã vào khu VIP!',
        level: 'info',
        durationMs: 3_500,
      },
      { type: 'SHOW_BUBBLE', variant: 'vip', durationMs: 2_500 },
      { type: 'TTS', template: '{user.nickname} đã vào khu VIP!', priority: 'normal' },
    ],
  },

  {
    ruleId: 'reminder-type-go',
    description: 'Nhắc khán giả gõ GO. Timer do Main sở hữu; Core chỉ nhận trigger.',
    enabled: true,
    trigger: 'timer:reminder',
    priority: PRIORITY.reminder,
    conditions: [],
    cooldown: { globalMs: 60_000 },
    actions: [
      {
        type: 'SHOW_ANNOUNCEMENT',
        template: 'Gõ GO trong khung chat để lên sân khấu nhảy cùng mọi người!',
        level: 'info',
        durationMs: 4_000,
      },
      { type: 'SHOW_BUBBLE', variant: 'go', durationMs: 2_500 },
      { type: 'TTS', template: 'Gõ GO trong khung chat để lên sân khấu nhé!', priority: 'low' },
    ],
  },

  {
    ruleId: 'minigame-hook-party-goal',
    description:
      'Điểm mở rộng cho mini-game (Task 14). Tắt mặc định — Task 10 chỉ phát typed hook.',
    enabled: false,
    trigger: 'game:party-goal-complete',
    priority: PRIORITY.partyGoal - 1,
    conditions: [],
    cooldown: { globalMs: 30_000 },
    actions: [{ type: 'START_MINIGAME_HOOK', hookId: 'party-goal-bonus' }],
  },
];

/**
 * Runtime defaults.
 *
 * Queue numbers follow the task's suggested Task 10 defaults: 20 queued, 180 spoken characters,
 * ~8s duplicate window and a 15–30s TTL that shortens as priority drops, so a low-priority
 * reminder can never be spoken long after it stopped being true.
 */
export const DEFAULT_AUTO_HOST_CONFIG: AutoHostConfig = {
  enabled: true,
  reminderIntervalMs: 120_000,
  maxTextLength: 180,
  tts: { enabled: true, lang: 'vi-VN', rate: 1, pitch: 1, volume: 1 },
  queue: {
    maxQueued: 20,
    maxTextLength: 180,
    duplicateWindowMs: 8_000,
    ttlMs: { critical: 30_000, high: 25_000, normal: 20_000, low: 15_000 },
    interruptPolicy: 'lower-priority-only',
    maxRetries: 1,
  },
  rules: [...VIETNAMESE_DEFAULT_RULES],
};

/** Deep copy so a runtime edit can never mutate the shipped preset. */
export function createDefaultAutoHostConfig(): AutoHostConfig {
  return {
    ...DEFAULT_AUTO_HOST_CONFIG,
    tts: { ...DEFAULT_AUTO_HOST_CONFIG.tts },
    queue: {
      ...DEFAULT_AUTO_HOST_CONFIG.queue,
      ttlMs: { ...DEFAULT_AUTO_HOST_CONFIG.queue.ttlMs },
    },
    rules: DEFAULT_AUTO_HOST_CONFIG.rules.map((rule) => ({
      ...rule,
      conditions: rule.conditions.map((condition) => ({ ...condition })),
      cooldown: { ...rule.cooldown },
      actions: rule.actions.map((action) => ({ ...action })),
    })),
  };
}
