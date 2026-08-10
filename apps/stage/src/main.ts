import { CONTRACTS_SCHEMA_VERSION } from '@dance-arena/contracts';

import { mountStage } from './stage/mountStage.js';
import './styles.css';

/**
 * STAGE entry point — Task 00 skeleton.
 *
 * STAGE never computes gameplay: it waits for `stage:snapshot` and incremental stage events from
 * Main (Blueprint §29/§60). Task 06 wires that bus; for now it only mounts an empty Pixi canvas.
 */
const container = document.getElementById('stage-root');

if (container === null) {
  throw new Error('STAGE bootstrap failed: #stage-root not found in index.html');
}

container.dataset.contractsSchemaVersion = String(CONTRACTS_SCHEMA_VERSION);

void mountStage({ container });
