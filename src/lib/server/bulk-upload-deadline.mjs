import {
  getBulkUploadIdleTimeoutMs, getBulkUploadResponseTimeoutMs,
} from "./bulk-upload-settings.mjs";

/** No wall-clock upload limit: only stalled transfers and response waits expire. */
export function createBulkUploadDeadline({
  idleTimeoutMs = getBulkUploadIdleTimeoutMs(),
  responseTimeoutMs = getBulkUploadResponseTimeoutMs(),
} = {}) {
  const controller = new AbortController();
  let phase = "upload";
  let lastProgressAt = Date.now();
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  /** @type {{ source: string; message: string } | null} */
  let failure = null;

  function arm(ms, source, message) {
    clearTimeout(timer);
    const expire = () => {
      if (phase === "upload") {
        const remaining = idleTimeoutMs - (Date.now() - lastProgressAt);
        if (remaining > 0) {
          timer = setTimeout(expire, remaining);
          timer.unref?.();
          return;
        }
      }
      failure = { source, message };
      controller.abort(new DOMException(message, "TimeoutError"));
    };
    timer = setTimeout(expire, ms);
    timer.unref?.();
  }

  function uploadProgress() {
    if (phase !== "upload" || controller.signal.aborted) return;
    // Updating a timestamp avoids allocating/resetting a timer for every chunk.
    lastProgressAt = Date.now();
    if (!timer) arm(idleTimeoutMs, "manager_upload_idle_timeout",
      "파일 수신·백엔드 방향 전송이 진행되지 않아 업로드 연결을 종료했습니다.");
  }

  function waitForResponse() {
    if (phase !== "upload" || controller.signal.aborted) return;
    phase = "response";
    arm(responseTimeoutMs, "manager_response_deadline",
      "파일 전송 후 서버 응답 대기 제한 시간이 초과되었습니다.");
  }

  function dispose() {
    phase = "disposed";
    clearTimeout(timer);
  }

  uploadProgress();
  return {
    signal: controller.signal, uploadProgress, waitForResponse, dispose,
    get failure() { return failure; },
  };
}
