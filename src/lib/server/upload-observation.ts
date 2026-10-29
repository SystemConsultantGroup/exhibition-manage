import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { subscribe } from "node:diagnostics_channel";
import type { ProxyUploadStatus } from "../bulk-upload-status";

interface Entry {
  status: ProxyUploadStatus;
  ownerHash: Buffer;
  expiresAt: number;
}
interface ObservationStore {
  records: Map<string, Entry>;
  context: AsyncLocalStorage<Entry>;
  requests: WeakMap<object, Entry>;
}
const globalStore = globalThis as typeof globalThis & { __uploadObservation?: ObservationStore };

function touch(entry: Entry) { entry.status.updatedAt = Date.now(); }

function createStore(): ObservationStore {
  const store: ObservationStore = {
    records: new Map(), context: new AsyncLocalStorage(), requests: new WeakMap(),
  };
  // Undici emits these for actual socket writes, not merely iterator reads.
  // Socket writes still do NOT acknowledge receipt or persistence at the backend.
  subscribe("undici:request:create", (message) => {
    const entry = store.context.getStore();
    const { request } = message as { request: object };
    if (entry) store.requests.set(request, entry);
  });
  subscribe("undici:client:sendHeaders", (message) => {
    const { request } = message as { request: object };
    const entry = store.requests.get(request);
    if (entry) { entry.status.sendingStartedAt ??= Date.now(); touch(entry); }
  });
  subscribe("undici:request:bodyChunkSent", (message) => {
    const { request, chunk } = message as { request: object; chunk: Uint8Array | string };
    const entry = store.requests.get(request);
    if (entry) {
      entry.status.sentBytes += typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.byteLength;
      touch(entry);
    }
  });
  subscribe("undici:request:bodySent", (message) => {
    const { request } = message as { request: object };
    const entry = store.requests.get(request);
    if (entry) {
      entry.status.sendingFinishedAt = Date.now();
      touch(entry);
      console.info("Bulk upload upstream socket body sent", {
        uploadId: entry.status.id,
        elapsedMs: Date.now() - entry.status.startedAt,
        receivedBytes: entry.status.receivedBytes,
        sentBytes: entry.status.sentBytes,
      });
    }
  });
  return store;
}

const store = globalStore.__uploadObservation ??= createStore();
function ownerHash(authorization: string, exhibitionId: string) {
  return createHash("sha256").update(authorization).update("\0").update(exhibitionId).digest();
}

export function beginUploadObservation(
  requestedId: string | null,
  authorization: string,
  exhibitionId: string,
  totalBytes: number | null,
  timeoutMs: number
): Entry {
  const now = Date.now();
  for (const [key, entry] of store.records) {
    if (entry.expiresAt < now) store.records.delete(key);
  }
  // Bound memory usage; a missing observation must never block the upload itself.
  if (store.records.size >= 1000) store.records.delete(store.records.keys().next().value!);
  const entry: Entry = {
    ownerHash: ownerHash(authorization, exhibitionId),
    expiresAt: now + timeoutMs + 5 * 60_000,
    status: {
      id: requestedId ?? randomUUID(), startedAt: now, updatedAt: now,
      receivedBytes: 0, sentBytes: 0, totalBytes,
      receivingFinishedAt: null, sendingStartedAt: null, sendingFinishedAt: null,
      responseReceivedAt: null, responseStatus: null, failure: null,
    },
  };
  // Never overwrite another in-flight request's observation.
  if (!store.records.has(entry.status.id)) store.records.set(entry.status.id, entry);
  return entry;
}

export function getUploadObservation(id: string, authorization: string, exhibitionId: string): ProxyUploadStatus | null {
  const entry = store.records.get(id);
  if (!entry || entry.expiresAt < Date.now()) return null;
  if (!timingSafeEqual(entry.ownerHash, ownerHash(authorization, exhibitionId))) return null;
  return entry.status;
}

export function withUploadObservation<T>(entry: Entry, action: () => T): T {
  return store.context.run(entry, action);
}

export function updateUploadObservation(entry: Entry, changes: Partial<ProxyUploadStatus>) {
  Object.assign(entry.status, changes);
  touch(entry);
}
