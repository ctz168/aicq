import { store } from '../db/memoryStore';
import { TempNumberRecord } from '../models/types';
import { config } from '../config';

/**
 * Generate a random 6-digit number string (100000-999999) and store it
 * with the configured TTL. Multiple people can use the same number to
 * send friend requests — there is no usage limit.
 */
export function requestTempNumber(nodeId: string): TempNumberRecord {
  // Ensure the requesting node exists
  if (!store.nodes.has(nodeId)) {
    throw new Error('Node not registered');
  }

  // Generate a unique 6-digit number
  let number: string;
  const maxAttempts = 100;
  let attempts = 0;
  do {
    number = String(Math.floor(100000 + Math.random() * 900000));
    attempts++;
    if (attempts >= maxAttempts) {
      throw new Error('Unable to generate unique temp number');
    }
  } while (store.tempNumbers.has(number));

  const now = Date.now();
  const ttlMs = config.tempNumberTtlHours * 60 * 60 * 1000;

  const record: TempNumberRecord = {
    number,
    nodeId,
    expiresAt: now + ttlMs,
    createdAt: now,
  };

  store.tempNumbers.set(number, record);
  store.persistTempNumber(record);

  return record;
}

/**
 * Look up a temp number. Returns null if not found or expired.
 */
export function resolveTempNumber(number: string): TempNumberRecord | null {
  const record = store.tempNumbers.get(number);
  if (!record) return null;
  if (record.expiresAt <= Date.now()) {
    store.tempNumbers.delete(number);
    return null;
  }
  return record;
}

/**
 * Revoke a temp number. Only the owner can revoke their own number.
 * Returns true if successfully revoked, false otherwise.
 */
export function revokeTempNumber(nodeId: string, number: string): boolean {
  const record = store.tempNumbers.get(number);
  if (!record) return false;
  if (record.nodeId !== nodeId) return false;
  store.tempNumbers.delete(number);
  return true;
}

/**
 * Remove all expired temp numbers from the store.
 */
export function cleanup(): number {
  return store.cleanupExpiredTempNumbers();
}
