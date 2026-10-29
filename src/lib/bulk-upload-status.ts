/** Observable proxy-side facts only; none of these prove MinIO persistence. */
export interface ProxyUploadStatus {
  id: string;
  startedAt: number;
  updatedAt: number;
  receivedBytes: number;
  sentBytes: number;
  totalBytes: number | null;
  receivingFinishedAt: number | null;
  sendingStartedAt: number | null;
  sendingFinishedAt: number | null;
  responseReceivedAt: number | null;
  responseStatus: number | null;
  failure: { source: string; code: string | null; message: string } | null;
}
