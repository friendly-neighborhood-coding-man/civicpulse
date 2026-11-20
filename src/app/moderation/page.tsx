import Link from "next/link";

import DemoSignInCard from "@/components/DemoSignInCard";
import ModerationQueue from "@/components/ModerationQueue";
import { getSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/connection";
import { listEvidenceQueue } from "@/lib/domain/community";

export const dynamic = "force-dynamic";

export const metadata = { title: "근거 검토" };

export default async function ModerationPage() {
  const db = getDb();
  const user = await getSessionUser(db);

  if (!user) {
    return (
      <div className="container-page py-14">
        <DemoSignInCard heading="검토 화면은 운영자 계정으로 로그인해야 합니다" />
      </div>
    );
  }

  if (user.role !== "moderator") {
    return (
      <div className="container-page py-14">
        <div className="card mx-auto max-w-lg p-8">
          <h1 className="text-lg font-semibold text-ink">접근할 수 없습니다</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            추가 근거 검토는 운영자 역할만 사용할 수 있습니다. 현재{" "}
            {user.displayName} 님은 시민 역할입니다. 운영자 계정으로 로그인하면
            검토 흐름을 사용할 수 있습니다.
          </p>
          <Link
            href="/issues"
            className="mt-5 inline-flex h-10 items-center rounded-full border border-line px-4 text-sm font-semibold text-ink"
          >
            공개 제보 둘러보기
          </Link>
        </div>
      </div>
    );
  }

  const queue = listEvidenceQueue(db);

  return (
    <div className="container-page py-10 sm:py-14">
      <header className="max-w-2xl">
        <p className="label-caps text-accent">운영자</p>
        <h1 className="mt-2 text-3xl font-bold text-ink">추가 근거 검토</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          시민이 보낸 근거는 승인 전까지 공개되지 않습니다. 사진에 개인정보가 없는지
          직접 확인하고, 제보와 무관하거나 중복된 내용은 반려하세요.
        </p>
        <p className="mt-2 text-[11px] text-muted">
          대기 {queue.length}건 · 승인·반려 결과는 검토자와 시각이 함께 기록됩니다.
        </p>
      </header>

      <ModerationQueue queue={queue} />
    </div>
  );
}
