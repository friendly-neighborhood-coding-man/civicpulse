"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { PublicUser } from "@/lib/domain/users";

/** Signed-in account controls for the password provider. */
export default function AuthMenu({ user }: { user: PublicUser | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/session", { method: "DELETE" });
      router.push("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="inline-flex h-10 items-center rounded-full border border-line bg-surface px-4 text-sm font-medium text-ink transition hover:border-line-strong"
      >
        로그인
      </Link>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href="/account"
        className="inline-flex h-10 items-center rounded-full border border-line bg-surface px-3 text-sm font-medium text-ink transition hover:border-line-strong"
      >
        {user.displayName}
      </Link>
      <button
        type="button"
        onClick={() => void signOut()}
        disabled={busy}
        className="h-10 rounded-full border border-line px-3 text-sm whitespace-nowrap text-muted transition hover:border-line-strong hover:text-ink disabled:opacity-50"
      >
        로그아웃
      </button>
    </div>
  );
}
