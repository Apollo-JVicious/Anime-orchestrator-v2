import { IntegrationStore } from './store';

interface IntegrationRuntimeState {
  initialized: boolean;
  store: IntegrationStore | null;
  error: Error | null;
}

const state: IntegrationRuntimeState = {
  initialized: false,
  store: null,
  error: null,
};

function initialize(): void {
  if (state.initialized) return;
  state.initialized = true;
  try {
    state.store = new IntegrationStore();
  } catch (error) {
    state.error = error instanceof Error ? error : new Error('Integration storage failed to initialize.');
  }
}

export function getIntegrationStore(): IntegrationStore | null {
  initialize();
  return state.store;
}

export function getIntegrationConfigurationError(): Error | null {
  initialize();
  return state.error;
}

/** Test-only reset so isolated processes can change environment configuration safely. */
export function resetIntegrationRuntimeForTests(): void {
  state.store?.close();
  state.initialized = false;
  state.store = null;
  state.error = null;
}
