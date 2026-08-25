"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Item } from "@/lib/types";
import { apiJson } from "@/lib/api";
import { ItemForm, updateItem } from "@/components/ItemForm";
import { useExhibition } from "@/components/ExhibitionProvider";

export default function EditItemPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { selected } = useExhibition();
  const [item, setItem] = useState<Item | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selected) return;
    const tenantDomain = selected.defaultDomain ?? selected.customDomain;
    if (!tenantDomain) return;
    apiJson<Item>(`/items/${id}`, { tenantDomain }).then(setItem);
  }, [id, selected]);

  if (!item) return <p className="text-gray-500">불러오는 중…</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">항목 수정</h1>
      <ItemForm
        initial={item}
        submitting={saving}
        onSubmit={async (data) => {
          if (!selected) { alert("전시를 먼저 선택하세요."); return; }
          setSaving(true);
          try {
            await updateItem(id, data, selected.id);
            router.push("/items");
          } catch (e) {
            alert((e as Error).message);
          } finally {
            setSaving(false);
          }
        }}
      />
    </div>
  );
}
