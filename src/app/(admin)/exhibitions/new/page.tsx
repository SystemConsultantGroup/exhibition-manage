"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { Exhibition } from "@/lib/types";
import { apiMultipart } from "@/lib/api";

export default function NewExhibitionPage() {
  const router = useRouter();
  const logoRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    slug: "", defaultDomain: "", customDomain: "", name: "", description: "",
    bannerEnabled: false, popupEnabled: false, popupUrl: "",
    introTitle: "", introDescription: "",
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const created = await apiMultipart<Exhibition>("/admin/exhibitions", [
        {
          name: "request",
          json: {
            slug: form.slug,
            defaultDomain: form.defaultDomain,
            customDomain: form.customDomain || null,
            name: form.name,
            description: form.description || null,
            bannerEnabled: form.bannerEnabled,
            popupEnabled: form.popupEnabled,
            popupUrl: form.popupUrl || null,
            introTitle: form.introTitle || null,
            introDescription: form.introDescription || null,
          },
        },
        ...(logoRef.current?.files?.[0] ? [{ name: "logoFile", file: logoRef.current.files[0] }] : []),
        ...(bannerRef.current?.files?.[0] ? [{ name: "bannerFile", file: bannerRef.current.files[0] }] : []),
        ...(popupRef.current?.files?.[0] ? [{ name: "popupImageFile", file: popupRef.current.files[0] }] : []),
        ...(videoRef.current?.files?.[0] ? [{ name: "introVideoFile", file: videoRef.current.files[0] }] : []),
      ]);
      router.push("/exhibitions");
      router.refresh();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">새 전시 생성</h1>
      <form onSubmit={submit} className="card space-y-4">
        <div>
          <label className="label">전시명 *</label>
          <input required className="input" value={form.name} onChange={set("name")} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">slug * (영문 소문자/숫자/하이픈)</label>
            <input
              required pattern="[a-z0-9-]+" title="영문 소문자, 숫자, 하이픈만"
              className="input" value={form.slug} onChange={set("slug")}
            />
          </div>
          <div>
            <label className="label">기본 도메인 *</label>
            <input required className="input" placeholder="example.com"
              value={form.defaultDomain} onChange={set("defaultDomain")} />
          </div>
        </div>
        <div>
          <label className="label">설명</label>
          <textarea className="input" rows={3} value={form.description} onChange={set("description")} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <input type="checkbox" id="bannerEnabled" checked={form.bannerEnabled}
              onChange={(e) => setForm((f) => ({ ...f, bannerEnabled: e.target.checked }))} />
            <label htmlFor="bannerEnabled" className="text-sm font-medium">배너 사용</label>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="popupEnabled" checked={form.popupEnabled}
              onChange={(e) => setForm((f) => ({ ...f, popupEnabled: e.target.checked }))} />
            <label htmlFor="popupEnabled" className="text-sm font-medium">팝업 사용</label>
          </div>
        </div>
        {form.popupEnabled && (
          <div>
            <label className="label">팝업 링크 URL</label>
            <input className="input" value={form.popupUrl} onChange={set("popupUrl")} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <FileInput label="로고 이미지" inputRef={logoRef} accept="image/*" />
          <FileInput label="배너 이미지" inputRef={bannerRef} accept="image/*" />
          <FileInput label="팝업 이미지" inputRef={popupRef} accept="image/*" />
          <FileInput label="인트로 영상 (MP4/WebM/MOV)" inputRef={videoRef} accept="video/*" />
        </div>
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="label">인트로 제목</label>
            <input maxLength={200} className="input" value={form.introTitle} onChange={set("introTitle")} />
          </div>
          <div>
            <label className="label">인트로 설명</label>
            <textarea className="input" rows={2} value={form.introDescription} onChange={set("introDescription")} />
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={saving} className="btn-primary flex-1">
            {saving ? "생성 중…" : "생성"}
          </button>
        </div>
      </form>
    </div>
  );
}

function FileInput({ label, inputRef, accept }: {
  label: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  accept: string;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input ref={inputRef} type="file" accept={accept} className="input file:mr-2 file:rounded file:border-0 file:bg-indigo-50 file:px-2 file:py-1 file:text-indigo-700" />
    </div>
  );
}

