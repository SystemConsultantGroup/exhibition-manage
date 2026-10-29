import type { BulkUploadProgress } from "@/lib/bulk-upload";

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function ByteProgress({ label, loaded, total, finished }: {
  label: string; loaded: number; total: number | null; finished: boolean;
}) {
  const percentage = total && total > 0 ? Math.min(100, Math.floor(loaded / total * 100)) : null;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap justify-between gap-2 text-xs text-gray-600">
        <span>{label}</span>
        <span>{formatBytes(loaded)}{total !== null && ` / ${formatBytes(total)}`}{percentage !== null && ` (${percentage}%)`}</span>
      </div>
      <progress aria-label={label} className="h-2 w-full accent-blue-600" max={100}
        value={finished ? 100 : percentage ?? undefined} />
    </div>
  );
}

export function BulkUploadStatus({ progress, elapsedSeconds, error, summary }: {
  progress: BulkUploadProgress;
  elapsedSeconds: number;
  error: string | null;
  summary: string | null;
}) {
  const { phase, loadedBytes, totalBytes, browserUploadFinished, proxy, observationAvailable } = progress;
  const inactive = phase === "completed" || phase === "failed";
  const duration = elapsedSeconds >= 60
    ? `${Math.floor(elapsedSeconds / 60)}분 ${elapsedSeconds % 60}초` : `${elapsedSeconds}초`;
  const label = phase === "preparing" ? "업로드 준비 · 인증 확인"
    : phase === "completed" ? "등록 완료"
    : phase === "failed" ? "요청 실패 · 결과 확인 필요"
    : phase === "receiving" ? "응답 수신 중"
    : observationAvailable && proxy?.sendingFinishedAt ? "백엔드 방향 송신 완료 · 응답 대기"
    : observationAvailable && proxy?.sendingStartedAt ? "프록시에서 백엔드 방향으로 전송 중"
    : browserUploadFinished ? "브라우저 송신 완료 · 프록시 상태 확인 중"
    : "브라우저에서 매니저로 전송 중";

  return (
    <div className="mt-4 space-y-3 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="font-medium">{label}</p>
        <span className="text-gray-500">경과 {duration}</span>
      </div>
      <ol className="space-y-3">
        <li>
          <p className="mb-1 font-medium">1. 브라우저 → 매니저 앞단: {browserUploadFinished ? "송신 완료"
            : phase === "preparing" ? "전송 전"
            : phase === "requesting" ? "요청 시작"
            : inactive ? "전송 종료" : "전송 중"}</p>
          <ByteProgress label="브라우저가 보고한 송신량" loaded={loadedBytes} total={totalBytes} finished={browserUploadFinished} />
          <p className="text-xs text-gray-500">브라우저 관측값입니다. 앞단 프록시가 버퍼링하면 매니저 수신량과 다를 수 있습니다.</p>
        </li>
        <li>
          <p className="mb-1 font-medium">2. 매니저 프록시 수신: {proxy
            ? proxy.receivingFinishedAt ? "본문 수신 완료" : "수신 관측됨"
            : "아직 관측되지 않음"}</p>
          {proxy && <ByteProgress label="매니저가 실제로 읽은 본문" loaded={proxy.receivedBytes} total={proxy.totalBytes} finished={proxy.receivingFinishedAt !== null} />}
        </li>
        <li>
          <p className="mb-1 font-medium">3. 프록시 → 백엔드 연결: {proxy?.sendingFinishedAt ? "송신 완료"
            : proxy?.sendingStartedAt ? "요청 송신 시작됨" : "아직 관측되지 않음"}</p>
          {proxy && <ByteProgress label="백엔드 연결 소켓에 기록한 본문" loaded={proxy.sentBytes} total={proxy.totalBytes} finished={proxy.sendingFinishedAt !== null} />}
          <p className="text-xs text-gray-500">소켓 송신량이며, 백엔드의 수신·저장 완료를 보장하지 않습니다.</p>
        </li>
        <li>
          <p className="font-medium">4. 백엔드 내부 처리 / MinIO 저장: {phase === "completed" ? "최종 성공 응답 확인" : "내부 진행 상황 확인 불가"}</p>
          <p className="text-xs text-gray-500">백엔드가 처리 상태를 제공하지 않으므로 엑셀 검증·DB 등록·파일 저장 중 어느 단계인지는 알 수 없습니다.</p>
          {proxy?.responseStatus !== null && proxy?.responseStatus !== undefined && (
            <p className="text-xs text-gray-600">상위 서버 응답 헤더 수신: HTTP {proxy.responseStatus} (게이트웨이 응답일 수도 있음)</p>
          )}
        </li>
      </ol>
      {!observationAvailable && phase !== "preparing" && (
        <p className="text-xs text-amber-700">
          프록시 관측 정보를 현재 조회하지 못했습니다. 앞단 버퍼링·다른 서버 인스턴스·상태 조회 실패 등의 가능성이 있으며, 업로드 실패를 의미하지 않습니다.
          {proxy && " 수신·송신량은 마지막으로 관측된 값입니다."}
          {proxy && ` (업로드 시작 후 ${Math.max(0, Math.floor((proxy.updatedAt - proxy.startedAt) / 1000))}초 시점)`}
        </p>
      )}
      {proxy?.failure && (
        <p className="text-red-700">프록시 관측 실패: {proxy.failure.source}{proxy.failure.code && ` (${proxy.failure.code})`} — {proxy.failure.message}</p>
      )}
      {!inactive && <p className="text-gray-500">등록 완료 응답을 받을 때까지 페이지를 유지해주세요.</p>}
      {summary && <p className="text-green-700">{summary}</p>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <p className="break-all text-xs text-gray-500">요청 ID: {progress.uploadId}</p>
    </div>
  );
}
