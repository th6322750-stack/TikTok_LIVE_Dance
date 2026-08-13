/**
 * Wires the preload bridge into the CONTROL view state.
 *
 * The handshake mirrors Blueprint §61: on mount CONTROL announces itself, receives the full
 * initial state, then applies incremental events. A CONTROL reload therefore rebuilds its view
 * without disturbing the LIVE session or the canonical state in Main.
 */

import type { AutoHostRuntimeState, DanceArenaControlBridge } from '@dance-arena/contracts';
import { useCallback, useEffect, useMemo, useReducer } from 'react';

import { getControlBridge } from '../bridge/bridge.js';
import { controlReducer, INITIAL_CONTROL_STATE, type ControlViewState } from './controlStore.js';

export interface ControlStateHook {
  readonly state: ControlViewState;
  readonly bridge: DanceArenaControlBridge | undefined;
  /**
   * Stores the Auto Host state Main returned from a mutation.
   *
   * CONTROL renders Main's answer instead of predicting it, so a rejected or clamped edit shows
   * the value Main actually kept (Task 10 §9).
   */
  applyAutoHostState(state: AutoHostRuntimeState): void;
}

export function useControlState(
  bridgeOverride?: DanceArenaControlBridge | undefined,
): ControlStateHook {
  const [state, dispatch] = useReducer(controlReducer, INITIAL_CONTROL_STATE);
  const bridge = useMemo(() => bridgeOverride ?? getControlBridge(), [bridgeOverride]);

  useEffect(() => {
    if (bridge === undefined) {
      dispatch({ type: 'bridge-missing' });
      return;
    }

    let cancelled = false;

    void bridge.ready().then((initial) => {
      if (!cancelled) dispatch({ type: 'bridge-ready', initial });
    });

    // Auto Host runtime state is fetched the same way: CONTROL asks Main what it holds instead of
    // keeping its own copy (Task 10 §9).
    void bridge.autoHost.getState().then((state) => {
      if (!cancelled) dispatch({ type: 'autohost-state', state });
    });

    const unsubscribes = [
      bridge.onConnectorStatus((status) => dispatch({ type: 'connector-status', status })),
      bridge.onGameEvent((event) => dispatch({ type: 'game-event', event })),
      bridge.onStageWindowState((stageState) =>
        dispatch({ type: 'stage-window', state: stageState }),
      ),
      bridge.onDiagnosticsError((error) => dispatch({ type: 'diagnostics', error })),
      bridge.onAutoHostStatus((status) => dispatch({ type: 'autohost-status', status })),
    ];

    return () => {
      cancelled = true;
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [bridge]);

  const applyAutoHostState = useCallback((next: AutoHostRuntimeState): void => {
    dispatch({ type: 'autohost-state', state: next });
  }, []);

  return { state, bridge, applyAutoHostState };
}
