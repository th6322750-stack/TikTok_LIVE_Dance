/**
 * Safe template renderer (Task 10 §4 "Template renderer").
 *
 * A template is a plain string with `{variable}` placeholders. Rendering is a SINGLE pass of
 * string replacement over a fixed lookup table:
 *
 * - there is no expression parser, no `eval`, no `Function` constructor and no property walk, so a
 *   template can never execute code;
 * - only `AUTO_HOST_TEMPLATE_VARIABLES` resolve — anything else degrades to empty text;
 * - a substituted value is never re-scanned, so a nickname containing `{gift.diamonds}` stays
 *   literal instead of expanding;
 * - the result is Unicode-normalized, stripped of control/bidi characters, whitespace-collapsed
 *   and length-bounded.
 *
 * Comment text is not a template variable at all, which is what makes "no raw comment TTS"
 * (§10.7) structural rather than a convention.
 */

import type { AutoHostTemplateVariable, AutoHostTriggerContext } from '@dance-arena/contracts';
import { AUTO_HOST_TEMPLATE_VARIABLES, AUTO_HOST_TEXT_HARD_LIMIT } from '@dance-arena/contracts';

export interface TemplateRenderOptions {
  /** Upper bound for the rendered string; always clamped to `AUTO_HOST_TEXT_HARD_LIMIT`. */
  readonly maxLength?: number;
}

export interface TemplateRenderResult {
  readonly text: string;
  /** Placeholders that resolved to nothing, kept for CONTROL/QA diagnostics. */
  readonly unknownTokens: readonly string[];
  readonly truncated: boolean;
}

/** Matches `{name}` / `{group.name}`. Bounded length so a pathological template cannot backtrack. */
const TOKEN_PATTERN = /\{([A-Za-z][A-Za-z0-9]{0,30}(?:\.[A-Za-z][A-Za-z0-9]{0,30})?)\}/g;

const VARIABLE_SET: ReadonlySet<string> = new Set(AUTO_HOST_TEMPLATE_VARIABLES);

/**
 * Characters removed outright: zero-width joiners/spaces and bidi overrides. They are invisible in
 * an announcement but can reorder or hide the text around them.
 */
const REMOVED_CODE_POINTS: ReadonlySet<number> = new Set([
  0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067,
  0x2068, 0x2069, 0xfeff,
]);

/**
 * Builds the complete variable table for a trigger.
 *
 * Every entry is explicit. There is deliberately no generic "walk the context by path" fallback:
 * adding a variable has to happen here AND in the contract's whitelist.
 */
export function templateVariablesFor(
  context: AutoHostTriggerContext,
): Readonly<Partial<Record<AutoHostTemplateVariable, string>>> {
  const variables: Partial<Record<AutoHostTemplateVariable, string>> = {};

  if (context.user !== undefined) {
    variables['user.id'] = context.user.id;
    variables['user.nickname'] = context.user.nickname;
  }

  if (context.gift !== undefined) {
    variables['gift.name'] = context.gift.name;
    variables['gift.diamonds'] = String(context.gift.diamonds);
    if (context.gift.tierId !== undefined) variables['gift.tierId'] = context.gift.tierId;
  }

  if (context.rank !== undefined) {
    variables['rank.current'] = String(context.rank.current);
    if (context.rank.previous !== undefined) {
      variables['rank.previous'] = String(context.rank.previous);
    }
  }

  if (context.partyGoal !== undefined) {
    variables['partyGoal.current'] = String(context.partyGoal.current);
    variables['partyGoal.target'] = String(context.partyGoal.target);
  }

  if (context.command !== undefined) variables['command.type'] = context.command.type;

  return variables;
}

/**
 * Normalizes and bounds arbitrary text.
 *
 * Exported because Main sanitizes again before speaking: the boundary that produces text and the
 * boundary that consumes it each enforce the limit independently.
 */
export function sanitizeText(value: string, maxLength: number): TemplateRenderResult {
  const limit = Math.max(1, Math.min(maxLength, AUTO_HOST_TEXT_HARD_LIMIT));

  let cleaned = '';
  for (const char of value.normalize('NFC')) {
    const code = char.codePointAt(0) ?? 0;

    // C0/C1 controls and line/paragraph separators become a space so words never fuse together.
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029) {
      cleaned += ' ';
      continue;
    }

    if (REMOVED_CODE_POINTS.has(code)) continue;

    cleaned += char;
  }

  const collapsed = cleaned.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= limit) {
    return { text: collapsed, unknownTokens: [], truncated: false };
  }

  // Trim at the limit and drop a dangling partial word, then mark the cut with an ellipsis.
  const slice = collapsed.slice(0, limit - 1);
  const lastSpace = slice.lastIndexOf(' ');
  const body = lastSpace > limit / 2 ? slice.slice(0, lastSpace) : slice;

  return { text: `${body.trimEnd()}…`, unknownTokens: [], truncated: true };
}

export function renderTemplate(
  template: string,
  context: AutoHostTriggerContext,
  options: TemplateRenderOptions = {},
): TemplateRenderResult {
  const variables = templateVariablesFor(context);
  const unknownTokens: string[] = [];

  // One pass: substituted values are appended to the output and never re-examined, so viewer text
  // cannot smuggle a placeholder of its own into the result.
  const substituted = template.replace(TOKEN_PATTERN, (_match, rawName: string) => {
    if (!VARIABLE_SET.has(rawName)) {
      unknownTokens.push(rawName);
      return '';
    }

    const value = variables[rawName as AutoHostTemplateVariable];
    if (value === undefined) {
      unknownTokens.push(rawName);
      return '';
    }

    return value;
  });

  const sanitized = sanitizeText(substituted, options.maxLength ?? AUTO_HOST_TEXT_HARD_LIMIT);

  return { text: sanitized.text, unknownTokens, truncated: sanitized.truncated };
}

/**
 * Stable key used for duplicate suppression.
 *
 * Case- and whitespace-insensitive so "Cảm ơn A" and "cảm ơn  A" collapse, but it never merges two
 * different rules or two different users — those are separate components of the key (§6).
 */
export function dedupKeyFor(ruleId: string, userId: string | undefined, text: string): string {
  const normalized = text.normalize('NFC').toLocaleLowerCase('vi-VN').replace(/\s+/g, ' ').trim();
  return `${ruleId}|${userId ?? '-'}|${normalized}`;
}
