function positiveTimeout(raw, fallback) {
  const value = Number(raw);
  return raw && Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647
    ? value : fallback;
}

// Legacy setting now limits only the response phase, never an active upload.
export function getBulkUploadTimeoutMs(raw = process.env.BULK_UPLOAD_TIMEOUT_MS) {
  return positiveTimeout(raw, 15 * 60_000);
}

export function getBulkUploadIdleTimeoutMs(raw = process.env.BULK_UPLOAD_IDLE_TIMEOUT_MS) {
  return positiveTimeout(raw, 2 * 60_000);
}

export function getBulkUploadResponseTimeoutMs(raw = process.env.BULK_UPLOAD_RESPONSE_TIMEOUT_MS) {
  return positiveTimeout(raw, getBulkUploadTimeoutMs());
}
