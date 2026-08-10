/**
 * Secret access for Main (Blueprint §45).
 *
 * Task 12 replaces this with OS-backed encrypted storage. Until then the key is read from the
 * environment so nothing has to be committed. Two rules hold regardless of the backend:
 *   1. the value never leaves the Main process;
 *   2. the value is never logged — only its presence is reported.
 */

import type { SecretStore } from '../runtime/ports.js';

const API_KEY_ENV = 'DANCE_ARENA_EULERSTREAM_API_KEY';

export function createEnvSecretStore(env: NodeJS.ProcessEnv = process.env): SecretStore {
  const read = (): string | undefined => {
    const value = env[API_KEY_ENV];
    return value !== undefined && value.trim().length > 0 ? value.trim() : undefined;
  };

  return {
    getApiKey: read,
    hasApiKey: () => read() !== undefined,
  };
}

/** Masks a secret for logs: `sk-abcd…wxyz` → `sk-a…yz`. Never log the raw value. */
export function redactSecret(value: string | undefined): string {
  if (value === undefined || value.length === 0) return '<unset>';
  if (value.length <= 8) return '<redacted>';

  return `${value.slice(0, 4)}…${value.slice(-2)}`;
}
