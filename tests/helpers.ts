import { expect } from 'vitest';
import type { EngineResult } from '../src/engine/index.js';

export function unwrap<T>(result: EngineResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

export function expectFail(result: EngineResult<unknown>, message?: string): void {
  expect(result.ok).toBe(false);
  if (!result.ok && message) expect(result.error).toContain(message);
}
