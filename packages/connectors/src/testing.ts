/**
 * Test-only helpers for driving connectors deterministically.
 *
 * Exposed through the `@dance-arena/connectors/testing` subpath so integration tests in other
 * workspace packages can exercise the REAL connector over a fake transport, while the production
 * entry point stays free of test doubles.
 */

export {
  createFakeTransport,
  type FakeSocket,
  type FakeTransport,
} from './eulerstream/testing/fakeTransport.js';
export { ManualScheduler } from './support/scheduler.js';
