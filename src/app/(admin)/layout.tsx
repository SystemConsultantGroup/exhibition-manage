"use client";

import { AuthProvider } from "@/components/AuthProvider";
import { ExhibitionProvider } from "@/components/ExhibitionProvider";
import { AdminShell } from "@/components/AdminShell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ExhibitionProvider>
        <AdminShell>{children}</AdminShell>
      </ExhibitionProvider>
    </AuthProvider>
  );
}

