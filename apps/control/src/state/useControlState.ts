/**
 * Wires the preload bridge into the CONTROL view state.
 *
 * The handshake mirrors Blueprint §61: on mount CONTROL announces itself, receives the full
 * initial state, then applies incremental events. A CONTROL reload therefore rebuilds its view
 * without disturbing the LIVE session or the canonical state in Main.
 */

import type { DanceArenaControlBridge } from '@dance-arena/contracts';
import { useEffect, useMemo, useReducer } from 'react';

import { getControlBridge } from '../bridge/bridge.js';
import { controlReducer, INITIAL_CONTROL_STATE, type ControlViewState } from './controlStore.js';

export interface ControlStateHook {
  readonly state: ControlViewState;
  readonly bridge: DanceArenaControlBridge | undefined;
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

    const unsubscribes = [
      bridge.onConnectorStatus((status) => dispatch({ type: 'connector-status', status })),
      bridge.onGameEvent((event) => dispatch({ type: 'game-event', event })),
      bridge.onStageWindowState((stageState) =>
        dispatch({ type: 'stage-window', state: stageState }),
      ),
      bridge.onDiagnosticsError((error) => dispatch({ type: 'diagnostics', error })),
    ];

    return () => {
      cancelled = true;
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [bridge]);

  return { state, bridge };
}
