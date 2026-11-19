import Link from "next/link";

import DemoSignInCard from "@/components/DemoSignInCard";
import { getSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/connection";
import { categoryLabel } from "@/lib/domain/areas";
import { listOwnerReports } from "@/lib/domain/reports";

export const dynamic = "force-dynamic";

export const metadata = { title: "내 제보" };

const STATE_LABEL = {
  draft: "비공개 초안",
  published: "공개",
  removed: "숨김",
} as const;

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(date);
}

export default async function MyReportsPage() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <div className="container-page py-14">
        <DemoSignInCard heading="내 제보를 보려면 데모 사용자를 선택하세요" />
      </div>
    );
  }

  const reports = listOwnerReports(getDb(), user);

  return (
    <div className="container-page py-10 sm:py-14">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-caps text-accent">내 제보</p>
          <h1 className="mt-2 text-3xl font-bold text-ink">기록한 제보</h1>
          <p className="mt-2 text-sm text-muted">
            {user.displayName} 님의 초안 {reports.length}건 · 공개된 제보는 아직 없습니다.
          </p>
        </div>
        <Link
          href="/reports/new"
          className="inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent-strong"
        >
          새 제보 만들기
        </Link>
      </header>

      {reports.length === 0 ? (
        <div className="card mt-8 p-10 text-center">
          <p className="text-sm font-semibold text-ink">아직 만든 제보가 없습니다</p>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted">
            샘플 사진으로 시작해 볼 수 있습니다. 모든 데이터는 합성이며 실제
            신고로 전송되지 않습니다.
          </p>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {reports.map((report) => (
            <li key={report.publicId} className="card overflow-hidden">
              <Link href={`/reports/${report.publicId}`} className="block">
                {report.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- authenticated private route
                  <img
                    src={report.photo.url}
                    alt=""
                    className="h-40 w-full bg-surface-muted object-cover"
                  />
                ) : (
                  <div className="h-40 bg-surface-muted" />
                )}
                <div className="p-5">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="rounded-full border border-warn/30 bg-warn-soft px-2 py-1 font-semibold text-warn">
                      {STATE_LABEL[report.state]}
                    </span>
                    <span className="text-muted">
                      {report.areaLabel} · {categoryLabel(report.category)}
                    </span>
                  </div>
                  <h2 className="mt-2 line-clamp-2 text-base font-semibold text-ink">
                    {report.title || "제목 없는 초안"}
                  </h2>
                  <p className="mt-1 text-xs text-muted">
                    수정 {formatDateTime(report.updatedAt)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
