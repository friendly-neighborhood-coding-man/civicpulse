import Link from "next/link";

import { getDb } from "@/lib/db/connection";
import { categoryLabel } from "@/lib/domain/areas";
import { listPublicIssues } from "@/lib/domain/community";
import { STATUS_LABEL } from "@/lib/validation/community";

export const dynamic = "force-dynamic";

export const metadata = { title: "공개 제보 둘러보기" };

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeZone: "Asia/Seoul",
  }).format(date);
}

export default function IssuesFeedPage() {
  const issues = listPublicIssues(getDb());

  return (
    <div className="container-page py-10 sm:py-14">
      <header className="max-w-2xl">
        <p className="label-caps text-accent">공개 제보</p>
        <h1 className="mt-2 text-3xl font-bold text-ink">이웃이 공개한 기록</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          시민이 공개에 동의한 제보만 표시됩니다. 공식 확인 여부와 시민 주장은
          구분해서 보여주며, 지지 수는 사실 판정이 아닙니다.
        </p>
      </header>

      {issues.length === 0 ? (
        <div className="card mt-8 p-10 text-center">
          <p className="text-sm font-semibold text-ink">아직 공개된 제보가 없습니다</p>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted">
            직접 초안을 만들고 개인정보 검토를 거쳐 공개해 볼 수 있습니다. 모든
            데이터는 합성이며 실제 기관으로 전송되지 않습니다.
          </p>
          <Link
            href="/reports/new"
            className="mt-5 inline-flex h-10 items-center rounded-full bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent-strong"
          >
            새 제보 만들기
          </Link>
        </div>
      ) : (
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {issues.map((issue) => (
            <li key={issue.publicId} className="card overflow-hidden">
              <Link href={`/issues/${issue.publicId}`} className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={issue.photoUrl}
                  alt=""
                  className="h-44 w-full bg-surface-muted object-cover"
                />
              </Link>
              <div className="p-5">
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  {issue.officialStatus ? (
                    <span className="rounded-full border border-accent/30 bg-accent-soft px-2 py-1 font-semibold text-accent-strong">
                      공식 · {STATUS_LABEL[issue.officialStatus]}
                    </span>
                  ) : (
                    <span className="rounded-full border border-info/25 bg-info-soft px-2 py-1 font-semibold text-info">
                      공식 확인 없음
                    </span>
                  )}
                  <span className="text-muted">
                    {issue.areaLabel} · {categoryLabel(issue.category)}
                  </span>
                </div>
                <h2 className="mt-2 line-clamp-2 text-base font-semibold text-ink">
                  <Link href={`/issues/${issue.publicId}`} className="hover:underline">
                    {issue.title}
                  </Link>
                </h2>
                <p className="mt-2 text-xs text-muted">
                  지지 {issue.supportCount}명 · 공개 {formatDate(issue.publishedAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
