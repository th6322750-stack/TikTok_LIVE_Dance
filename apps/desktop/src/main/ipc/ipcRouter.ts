/**
 * Typed IPC router (Blueprint §38–§42).
 *
 * Every inbound renderer payload is validated with the contract schema BEFORE it reaches the
 * runtime — a renderer is treated as untrusted input, not as a trusted caller. Handlers are
 * registered from the schema map itself, so a new channel cannot be wired without a schema.
 */

import {
  controlInvokeSchemas,
  stageInvokeSchemas,
  type ControlInvokeChannel,
  type ControlInvokeRequest,
  type StageInvokeChannel,
} from '@dance-arena/contracts';
import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron';

import type { CoreRuntime } from '../../runtime/coreRuntime.js';

export interface IpcRouterOptions {
  readonly runtime: CoreRuntime;
  /** Only these WebContents may call CONTROL channels. */
  readonly isControlSender: (sender: WebContents) => boolean;
  /** Only these WebContents may call STAGE channels. */
  readonly isStageSender: (sender: WebContents) => boolean;
  readonly onError?: (channel: string, error: unknown) => void;
}

export class IpcRouter {
  private readonly registered: string[] = [];

  constructor(private readonly options: IpcRouterOptions) {}

  register(): void {
    for (const channel of Object.keys(controlInvokeSchemas) as ControlInvokeChannel[]) {
      this.handle(channel, (event, payload) => {
        if (!this.options.isControlSender(event.sender)) {
          throw new Error(`channel ${channel} is not available to this window`);
        }

        const parsed = controlInvokeSchemas[channel].safeParse(payload);
        if (!parsed.success) {
          throw new Error(`invalid payload for ${channel}: ${formatIssues(parsed.error.issues)}`);
        }

        return this.options.runtime.handleControlInvoke(
          channel,
          parsed.data as ControlInvokeRequest<typeof channel>,
        );
      });
    }

    for (const channel of Object.keys(stageInvokeSchemas) as StageInvokeChannel[]) {
      this.handle(channel, (event, payload) => {
        if (!this.options.isStageSender(event.sender)) {
          throw new Error(`channel ${channel} is not available to this window`);
        }

        const parsed = stageInvokeSchemas[channel].safeParse(payload);
        if (!parsed.success) {
          throw new Error(`invalid payload for ${channel}: ${formatIssues(parsed.error.issues)}`);
        }

        return this.options.runtime.handleStageReady();
      });
    }
  }

  dispose(): void {
    for (const channel of this.registered.splice(0, this.registered.length)) {
      ipcMain.removeHandler(channel);
    }
  }

  private handle(
    channel: string,
    handler: (event: IpcMainInvokeEvent, payload: unknown) => Promise<unknown>,
  ): void {
    ipcMain.handle(channel, async (event, payload: unknown) => {
      try {
        return await handler(event, payload);
      } catch (error) {
        this.options.onError?.(channel, error);
        // Surface a clean message to the renderer; never leak a stack or internal path.
        throw new Error(error instanceof Error ? error.message : `ipc failure on ${channel}`, {
          cause: error,
        });
      }
    });
    this.registered.push(channel);
  }
}

function formatIssues(issues: readonly { path: PropertyKey[]; message: string }[]): string {
  return issues
    .map(
      (issue) =>
        `${issue.path.map((part) => String(part)).join('.') || '<root>'}: ${issue.message}`,
    )
    .join('; ');
}
