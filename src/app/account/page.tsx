import Link from "next/link";
import { redirect } from "next/navigation";

import AccountDeletion from "@/components/AccountDeletion";
import { getAuthMode } from "@/lib/auth/mode";
import { getSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/connection";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getSessionUser(getDb());
  if (!user) redirect("/login");

  const mode = getAuthMode();

  return (
    <div className="container-page py-10 sm:py-14">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-ink">내 계정</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          {user.displayName} · @{user.handle} ·{" "}
          {user.role === "moderator" ? "운영자" : "시민"}
        </p>
        <p className="mt-1 text-[11px] text-muted">
          {mode === "password"
            ? "비밀번호 계정으로 로그인되어 있습니다."
            : "합성 데모 계정입니다. 실제 개인정보가 아닙니다."}
        </p>

        <section className="card mt-6 p-6">
          <h2 className="text-sm font-semibold text-ink">내 데이터 내려받기</h2>
          <p className="mt-2 text-xs leading-relaxed text-ink-soft">
            내가 작성한 제보·근거·상태 기록·지지·후속 초안을 JSON 파일로
            내려받습니다. 다른 사용자의 정보, 비밀번호 해시와 내부 저장 경로는
            포함되지 않습니다.
          </p>
          <a
            href="/api/account/export"
            className="mt-3 inline-flex h-10 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink transition hover:border-line-strong"
          >
            JSON 내려받기
          </a>
        </section>

        <div className="mt-6">
          <AccountDeletion requiresPassword={mode === "password"} />
        </div>

        <p className="mt-6 text-[11px] leading-relaxed text-muted">
          계정 삭제는 되돌릴 수 없습니다. 공개 제보는 먼저 공개 중단되고 사진·근거
          파일은 즉시 삭제 대기열로 들어가며, 실패하면 재시도됩니다. 공개 중단된
          기록은 보존 기간 뒤 삭제됩니다.{" "}
          <Link href="/reports" className="underline underline-offset-2">
            내 제보 보기
          </Link>
        </p>
      </div>
    </div>
  );
}
