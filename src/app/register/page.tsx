"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { getAccessToken } from "@/lib/auth";
import { useAuth } from "@/components/AuthProvider";

const USER_TYPES = [
  { value: "VISITOR", label: "방문객" },
  { value: "STUDENT", label: "학생" },
  { value: "STAFF", label: "교직원" },
  { value: "PROFESSOR", label: "교수" },
];

export default function RegisterPage() {
  const router = useRouter();
  const { refreshMe } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    userType: "STUDENT",
    name: "",
    email: "",
    department: "",
    phoneNumber: "",
    studentNumber: "",
  });

  useEffect(() => {
    // 토큰이 없으면 로그인부터
    if (!getAccessToken()) {
      window.location.href = "/login";
    }
  }, []);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) return;
    setSaving(true);
    try {
      const res = await fetch("/api/backend/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userType: form.userType,
          name: form.name,
          email: form.email,
          department: form.department || null,
          phoneNumber: form.phoneNumber || null,
          studentNumber: form.studentNumber || null,
        }),
      });
      if (!res.ok && res.status !== 204) {
        throw new Error(`등록 실패 (${res.status})`);
      }
      await refreshMe();
      router.replace("/");
    } catch (err) {
      alert((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30">
            <UserPlus size={22} />
          </div>
          <h1 className="text-xl font-bold text-slate-800">추가 정보 입력</h1>
          <p className="mt-1 text-sm text-slate-500">
            서비스 이용을 위해 정보를 입력해주세요
          </p>
        </div>

        <form onSubmit={submit} className="card space-y-4">
          <div>
            <label className="label">회원 유형 *</label>
            <select required className="input" value={form.userType} onChange={set("userType")}>
              {USER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">이름 *</label>
              <input required className="input" value={form.name} onChange={set("name")} />
            </div>
            <div>
              <label className="label">이메일 *</label>
              <input required type="email" className="input" value={form.email} onChange={set("email")} />
            </div>
          </div>
          <div>
            <label className="label">소속</label>
            <input className="input" placeholder="예: 소프트웨어학과" value={form.department} onChange={set("department")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">연락처</label>
              <input className="input" placeholder="010-1234-5678" value={form.phoneNumber} onChange={set("phoneNumber")} />
            </div>
            <div>
              <label className="label">학번</label>
              <input className="input" value={form.studentNumber} onChange={set("studentNumber")} />
            </div>
          </div>
          <button type="submit" disabled={saving} className="btn-primary w-full !py-2.5">
            {saving ? "등록 중…" : "완료"}
          </button>
        </form>
      </div>
    </main>
  );
}
