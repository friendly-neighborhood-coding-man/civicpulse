import Link from "next/link";

import { getAuthMode } from "@/lib/auth/mode";
import { getSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/connection";
import { listDemoUsers } from "@/lib/domain/users";

import AuthMenu from "./AuthMenu";
import IdentitySwitcher from "./IdentitySwitcher";

export default async function SiteHeader() {
  const db = getDb();
  const currentUser = await getSessionUser(db);
  const mode = getAuthMode();
  // Only the demo provider needs the synthetic user list.
  const users = mode === "demo" ? listDemoUsers(db) : [];

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="container-page flex h-16 flex-nowrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-6">
          <Link href="/" className="group flex shrink-0 items-center gap-2.5">
            <span
              aria-hidden
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-white"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
                <path
                  d="M2 13h4l2.5-6 3.5 12 3-8 2 2h5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="leading-tight">
              <span className="block text-[15px] font-bold tracking-tight text-ink">
                CivicPulse
              </span>
              <span className="hidden text-[11px] whitespace-nowrap text-muted sm:block">
                시민 제보 · 공동 추적
              </span>
            </span>
          </Link>

          <nav aria-label="주요 메뉴" className="hidden items-center gap-1 md:flex">
            <Link
              href="/reports"
              className="rounded-full px-3 py-2 text-sm font-medium text-muted transition hover:bg-surface-muted hover:text-ink"
            >
              내 제보
            </Link>
            <Link
              href="/reports/new"
              className="rounded-full px-3 py-2 text-sm font-medium text-muted transition hover:bg-surface-muted hover:text-ink"
            >
              새 제보
            </Link>
            <Link
              href="/issues"
              className="rounded-full px-3 py-2 text-sm font-medium text-muted transition hover:bg-surface-muted hover:text-ink"
            >
              둘러보기
            </Link>
            {currentUser?.role === "moderator" ? (
              <Link
                href="/moderation"
                className="rounded-full px-3 py-2 text-sm font-medium text-warn transition hover:bg-warn-soft"
              >
                검토
              </Link>
            ) : null}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="hidden items-center gap-1.5 rounded-full border border-warn/30 bg-warn-soft px-2.5 py-1 text-[11px] font-semibold text-warn sm:flex">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warn" />
            {mode === "demo" ? "데모 · 합성 데이터" : "계정 기반 배포"}
          </span>
          {mode === "demo" ? (
            <IdentitySwitcher users={users} currentUser={currentUser} />
          ) : (
            <AuthMenu user={currentUser} />
          )}
        </div>
      </div>
    </header>
  );
}
