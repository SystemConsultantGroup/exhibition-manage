"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ItemForm, createItem } from "@/components/ItemForm";
import { useExhibition } from "@/components/ExhibitionProvider";

export default function NewItemPage() {
  const router = useRouter();
  const { selected } = useExhibition();
  const [saving, setSaving] = useState(false);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">새 항목</h1>
      <ItemForm
        submitting={saving}
        onSubmit={async (data, files) => {
          if (!selected) { alert("전시를 먼저 선택하세요."); return; }
          setSaving(true);
          try {
            await createItem(data, files, selected.id);
            router.push("/items");
          } catch (e) {
            alert((e as Error).message);
          } finally {
            setSaving(false);
          }
        }}
      />
      {!selected && <p className="mt-2 text-sm text-red-500">전시를 먼저 선택하세요.</p>}
    </div>
  );
}
