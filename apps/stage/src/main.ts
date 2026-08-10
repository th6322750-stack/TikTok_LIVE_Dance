/**
 * STAGE entry point.
 *
 * STAGE never computes gameplay: it waits for `stage:ready` → snapshot, then renders incremental
 * events (Blueprint §29/§60).
 */

import { getStageBridge } from './bridge/bridge.js';
import { mountStage } from './stage/mountStage.js';
import './styles.css';

const container = document.getElementById('stage-root');

if (container === null) {
  throw new Error('STAGE bootstrap failed: #stage-root not found in index.html');
}

void mountStage({ container, bridge: getStageBridge() });
