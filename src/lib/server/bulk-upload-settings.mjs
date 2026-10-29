export function getBulkUploadTimeoutMs(raw = process.env.BULK_UPLOAD_TIMEOUT_MS) {
  const value = Number(raw);
  return raw && Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647
    ? value : 15 * 60_000;
}
