/**
 * Command parser + cooldown tracker (Blueprint §17–§18).
 */

import {
  COMMAND_KIND_BY_COMMAND,
  normalizeCommentText,
  type CommandAliasConfig,
  type CommandCooldownConfig,
  type CommandKind,
  type GameCommand,
} from '@dance-arena/contracts';

export interface CommandMatch {
  readonly command: GameCommand;
  readonly kind: CommandKind;
  readonly matchedAlias: string;
}

/**
 * Resolves a chat comment to a command.
 *
 * Matching is exact against the normalized text: a comment is a command only when the whole
 * message is the alias. This keeps "GO" a command while "let's go dancers!" stays a comment.
 */
export function parseCommand(
  normalizedComment: string,
  aliases: CommandAliasConfig,
): CommandMatch | undefined {
  const text = normalizeCommentText(normalizedComment);
  if (text.length === 0) return undefined;

  for (const [command, commandAliases] of Object.entries(aliases)) {
    if (commandAliases === undefined) continue;

    for (const alias of commandAliases) {
      if (alias === text) {
        const typedCommand = command as GameCommand;
        return {
          command: typedCommand,
          kind: COMMAND_KIND_BY_COMMAND[typedCommand],
          matchedAlias: alias,
        };
      }
    }
  }

  return undefined;
}

/**
 * Per `userId + commandKind` cooldown (Blueprint §18).
 *
 * The cooldown is keyed by kind, not by individual command, so spamming LEFT/RIGHT/DOWN in turn
 * cannot bypass the movement cooldown.
 */
export class CooldownTracker {
  private readonly lastAccepted = new Map<string, number>();

  constructor(private cooldowns: CommandCooldownConfig) {}

  setCooldowns(cooldowns: CommandCooldownConfig): void {
    this.cooldowns = cooldowns;
  }

  /** True when the command may run now. Does not record anything. */
  isReady(userId: string, kind: CommandKind, at: number): boolean {
    const cooldownMs = this.cooldowns[kind];
    if (cooldownMs <= 0) return true;

    const last = this.lastAccepted.get(keyOf(userId, kind));
    if (last === undefined) return true;

    return at - last >= cooldownMs;
  }

  /** Records an accepted command; only accepted commands start a new cooldown window. */
  record(userId: string, kind: CommandKind, at: number): void {
    this.lastAccepted.set(keyOf(userId, kind), at);
  }

  remainingMs(userId: string, kind: CommandKind, at: number): number {
    const last = this.lastAccepted.get(keyOf(userId, kind));
    if (last === undefined) return 0;

    return Math.max(0, this.cooldowns[kind] - (at - last));
  }

  clear(): void {
    this.lastAccepted.clear();
  }
}

function keyOf(userId: string, kind: CommandKind): string {
  return `${userId}|${kind}`;
}
