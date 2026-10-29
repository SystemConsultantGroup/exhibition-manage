"use client";

import { ensureAccessToken, refreshAccessTokenAfterUnauthorized } from "./auth";
import type { BulkUploadResult } from "./types";
import type { ProxyUploadStatus } from "./bulk-upload-status";

export type BulkUploadPhase =
  | "preparing" | "requesting" | "uploading" | "waiting"
  | "receiving" | "completed" | "failed";

export interface BulkUploadProgress {
  phase: BulkUploadPhase;
  loadedBytes: number;
  totalBytes: number | null;
  browserUploadFinished: boolean;
  uploadId: string;
  proxy: ProxyUploadStatus | null;
  observationAvailable: boolean;
  observationCheckedAt: number | null;
}

const UNCERTAIN_RESULT_MESSAGE =
  "일괄 등록 결과를 확인하지 못했습니다. 서버에서 처리 중이거나 이미 등록됐을 수 있으므로, 항목 목록을 확인한 뒤 다시 시도하세요.";

function sendMultipart(
  body: FormData,
  token: string,
  exhibitionId: string,
  uploadId: string,
  report: (phase: BulkUploadPhase, loaded?: number, total?: number | null) => void
): Promise<{ status: number; text: string; source: string | null }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/backend/admin/items/bulk/upload");
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("X-Exhibition-Id", exhibitionId);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("X-Upload-Id", uploadId);
    // Let the browser serialize FormData and set its multipart boundary.
    // The proxy bounds stalled transfers and post-upload response waits separately.
    // An actively progressing upload has no fixed browser/manager duration limit.
    xhr.timeout = 0;
    xhr.upload.onprogress = (event) => {
      report("uploading", event.loaded, event.lengthComputable ? event.total : null);
    };
    xhr.upload.onload = (event) => report("waiting", event.loaded, event.lengthComputable ? event.total : null);
    xhr.onprogress = () => report("receiving");
    xhr.onload = () => resolve({
      status: xhr.status, text: xhr.responseText,
      source: xhr.getResponseHeader("X-Upload-Error-Source"),
    });
    xhr.onerror = () => reject(new Error(`${UNCERTAIN_RESULT_MESSAGE} 네트워크 및 매니저 프록시 로그를 확인해주세요.`));
    xhr.ontimeout = () => reject(new Error(UNCERTAIN_RESULT_MESSAGE));
    xhr.onabort = () => reject(new Error(`요청이 중단되었습니다. ${UNCERTAIN_RESULT_MESSAGE}`));
    report("requesting");
    xhr.send(body);
  });
}

// Polls never delay the upload or refresh/replay its credentials. An absent
// record is explicitly "unobserved", not proof of a stalled/failed request.
function observeProxyUpload(
  uploadId: string,
  token: string,
  exhibitionId: string,
  onObservation: (status: ProxyUploadStatus | null, available: boolean) => void
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  const poll = async () => {
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 5000);
    try {
      const response = await fetch(`/api/uploads/status?id=${encodeURIComponent(uploadId)}`, {
        headers: { Authorization: `Bearer ${token}`, "X-Exhibition-Id": exhibitionId },
        cache: "no-store",
        signal: controller.signal,
      });
      const data = response.ok ? await response.json() as { observation?: ProxyUploadStatus | null } : null;
      const observation = data?.observation;
      if (!stopped) onObservation(observation?.id === uploadId ? observation : null, observation?.id === uploadId);
    } catch {
      if (!stopped) onObservation(null, false);
    } finally {
      clearTimeout(timeout);
      if (!stopped) timer = setTimeout(() => { void poll(); }, 1500);
    }
  };
  void poll();
  return () => { stopped = true; clearTimeout(timer); controller?.abort(); };
}

function parseJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return null; }
}

function isBulkUploadResult(value: unknown): value is BulkUploadResult {
  if (!value || typeof value !== "object") return false;
  return ["createdItems", "createdMediaAssets", "createdClassificationMappings"].every((key) => {
    const count = (value as Record<string, unknown>)[key];
    return typeof count === "number" && Number.isSafeInteger(count) && count >= 0;
  });
}

/** Same-origin streaming proxy upload. No public backend URL and no automatic body replay. */
export async function uploadBulkItems(
  file: File,
  mediaFiles: File[],
  exhibitionId: string,
  onProgress?: (progress: BulkUploadProgress) => void
): Promise<BulkUploadResult> {
  const uploadId = crypto.randomUUID();
  let stopObserving: (() => void) | undefined;
  let progress: BulkUploadProgress = {
    phase: "preparing", loadedBytes: 0, totalBytes: null, browserUploadFinished: false, uploadId,
    proxy: null, observationAvailable: false, observationCheckedAt: null,
  };
  const report = (phase: BulkUploadPhase, loaded = progress.loadedBytes, total = progress.totalBytes) => {
    progress = {
      ...progress, phase, loadedBytes: loaded, totalBytes: total,
      browserUploadFinished: progress.browserUploadFinished || phase === "waiting",
    };
    onProgress?.(progress);
  };
  report("preparing");

  try {
    const token = await ensureAccessToken();
    if (!token) {
      window.location.replace("/login");
      throw new Error("인증이 필요합니다.");
    }

    const body = new FormData();
    body.append("file", file);
    for (const mediaFile of mediaFiles) body.append("mediaFiles", mediaFile);

    stopObserving = observeProxyUpload(uploadId, token, exhibitionId, (proxy, available) => {
      progress = {
        ...progress, proxy: proxy ?? progress.proxy,
        observationAvailable: available, observationCheckedAt: Date.now(),
      };
      onProgress?.(progress);
    });
    const response = await sendMultipart(body, token, exhibitionId, uploadId, report);
    if (response.status === 401) {
      await refreshAccessTokenAfterUnauthorized(token);
      throw new Error("인증이 만료되어 업로드가 거부되었습니다. 다시 시도해주세요. 파일은 자동 재전송하지 않았습니다.");
    }
    if (response.status < 200 || response.status >= 300) {
      const source = response.source ? ` 발생 구간: ${response.source}.` : " 발생 구간을 응답에서 확인할 수 없습니다. 앞단 게이트웨이 로그도 확인해주세요.";
      const data = parseJson(response.text);
      const message = data && typeof data === "object" && "message" in data && typeof data.message === "string"
        ? data.message.slice(0, 500) : "";
      const failure = `일괄 등록 실패 (${response.status})${message ? `: ${message}` : ""}.${source}`;
      if (response.status >= 500 || response.status === 0 || response.status === 408) {
        throw new Error(`${failure} ${UNCERTAIN_RESULT_MESSAGE}`);
      }
      throw new Error(failure);
    }

    report("receiving");
    const result = parseJson(response.text);
    if (!isBulkUploadResult(result)) throw new Error(UNCERTAIN_RESULT_MESSAGE);
    report("completed");
    return result;
  } catch (error) {
    report("failed");
    throw error;
  } finally {
    stopObserving?.();
  }
}
