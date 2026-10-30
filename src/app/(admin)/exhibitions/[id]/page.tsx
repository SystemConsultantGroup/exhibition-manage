"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Exhibition } from "@/lib/types";
import { apiMultipart } from "@/lib/api";
import { useExhibition } from "@/components/ExhibitionProvider";
import { DOMAIN_INPUT_PATTERN, isSafeExternalUrl } from "@/lib/validation";

export default function EditExhibitionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { exhibitions } = useExhibition();
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<Record<string, File | undefined>>({});
  const [form, setForm] = useState<Partial<Exhibition> & { customDomainInput?: string }>({});

  useEffect(() => {
    const exhibition = exhibitions.find((item) => item.id === id);
    if (exhibition) {
      setForm({ ...exhibition, customDomainInput: exhibition.customDomain ?? "" });
    }
  }, [id, exhibitions]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.popupUrl && !isSafeExternalUrl(form.popupUrl)) {
      alert("팝업 링크는 사용자 정보가 없는 HTTP(S) URL이어야 합니다.");
      return;
    }
    setSaving(true);
    try {
      await apiMultipart<Exhibition>(`/admin/exhibitions/${id}`, [{ name: "request", json: {
          defaultDomain: form.defaultDomain,
          customDomain: form.customDomainInput || null,
          name: form.name,
          description: form.description || null,
          logoMediaId: form.logoMediaId ?? null,
          bannerEnabled: form.bannerEnabled ?? false,
          bannerMediaId: form.bannerMediaId ?? null,
          popupEnabled: form.popupEnabled ?? false,
          popupImageMediaId: form.popupImageMediaId ?? null,
          popupUrl: form.popupUrl || null,
          introTitle: form.introTitle || null,
          introDescription: form.introDescription || null,
          introVideoMediaId: form.introVideoMediaId ?? null,
          showAwards: form.showAwards,
          defaultToLatestEventPeriod: form.defaultToLatestEventPeriod,
        } }, ...Object.entries(files).flatMap(([name, file]) => file ? [{ name, file }] : [])], undefined, "PUT");
      alert("저장되었습니다.");
      router.push("/exhibitions");
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">전시 수정</h1>
      <form onSubmit={submit} className="card space-y-4">
        <div>
          <label className="label">전시명 *</label>
          <input required className="input" value={form.name ?? ""} onChange={set("name")} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">기본 도메인 *</label>
            <input required pattern={DOMAIN_INPUT_PATTERN} className="input" value={form.defaultDomain ?? ""} onChange={set("defaultDomain")} />
          </div>
          <div>
            <label className="label">커스텀 도메인</label>
            <input pattern={DOMAIN_INPUT_PATTERN} className="input" value={form.customDomainInput ?? ""} onChange={set("customDomainInput")} />
          </div>
        </div>
        <div>
          <label className="label">설명</label>
          <textarea className="input" rows={3} value={form.description ?? ""} onChange={set("description")} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Toggle label="배너 사용" checked={!!form.bannerEnabled}
            onChange={(v) => setForm((f) => ({ ...f, bannerEnabled: v }))} />
          <Toggle label="팝업 사용" checked={!!form.popupEnabled}
            onChange={(v) => setForm((f) => ({ ...f, popupEnabled: v }))} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Toggle label="수상 표시" checked={form.showAwards ?? true}
            onChange={(v) => setForm((f) => ({ ...f, showAwards: v }))} />
          <Toggle label="최신 발표회차 기본 선택" checked={form.defaultToLatestEventPeriod ?? false}
            onChange={(v) => setForm((f) => ({ ...f, defaultToLatestEventPeriod: v }))} />
        </div>
        <fieldset className="space-y-3">
          <legend className="label">미디어 교체 (선택하지 않으면 기존 파일 유지)</legend>
          {([
            ["logoFile", "logoMediaId", "로고", "image/*"],
            ["bannerFile", "bannerMediaId", "배너", "image/*"],
            ["popupImageFile", "popupImageMediaId", "팝업 이미지", "image/*"],
            ["introVideoFile", "introVideoMediaId", "인트로 영상", "video/*"],
          ] as const).map(([name, key, label, accept]) => (
            <div key={name}>
              <label className="label" htmlFor={name}>{label}</label>
              <input id={name} type="file" accept={accept} className="input"
                onChange={(e) => setFiles((f) => ({ ...f, [name]: e.target.files?.[0] }))} />
              {form[key] && <button type="button" className="btn-ghost mt-1"
                onClick={() => setForm((f) => ({ ...f, [key]: null }))}>기존 연결 제거</button>}
            </div>
          ))}
        </fieldset>
        {form.popupEnabled && (
          <div>
            <label className="label">팝업 링크 URL</label>
            <input type="url" inputMode="url" className="input" value={form.popupUrl ?? ""} onChange={set("popupUrl")} />
          </div>
        )}
        <div>
          <label className="label">인트로 제목 (최대 200자)</label>
          <input maxLength={200} className="input" value={form.introTitle ?? ""} onChange={set("introTitle")} />
        </div>
        <div>
          <label className="label">인트로 설명</label>
          <textarea className="input" rows={2} value={form.introDescription ?? ""} onChange={set("introDescription")} />
        </div>
        <button type="submit" disabled={saving} className="btn-primary w-full">
          {saving ? "저장 중…" : "저장"}
        </button>
      </form>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="checkbox" id={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={label} className="text-sm font-medium">{label}</label>
    </div>
  );
}
