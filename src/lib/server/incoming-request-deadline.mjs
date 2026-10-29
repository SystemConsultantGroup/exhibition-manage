// Node's server-wide requestTimeout is absolute, not an inactivity timeout.
// Disable it so a progressing bulk upload is not killed after a fixed duration.
// Header protection and ordinary routes' incoming-body deadline remain bounded.
export const incomingHttpTimeouts = { requestTimeout: 0, headersTimeout: 60_000 };

export function enforceIncomingRequestDeadline(req, res, {
  timeoutMs = 5 * 60_000,
  onTimeout = () => {},
} = {}) {
  const cleanup = () => {
    clearTimeout(timer);
    req.off("end", cleanup);
    req.off("aborted", cleanup);
    req.off("close", cleanup);
    res.off("finish", onResponseFinished);
  };
  const timer = setTimeout(() => {
    cleanup();
    if (req.complete || req.destroyed) return;
    onTimeout();
    if (res.headersSent || res.destroyed || res.writableFinished) {
      // An early 401/413 response does not mean its incoming body completed.
      req.destroy();
      return;
    }
    res.writeHead(408, {
      "Connection": "close",
      "Cache-Control": "no-store",
      "X-Upload-Error-Source": "manager_inbound_request_timeout",
    });
    res.end();
  }, timeoutMs);
  const onResponseFinished = () => {
    if (req.complete || req.destroyed) cleanup();
  };
  timer.unref?.();
  req.once("end", cleanup);
  req.once("aborted", cleanup);
  req.once("close", cleanup);
  res.once("finish", onResponseFinished);
  return cleanup;
}
