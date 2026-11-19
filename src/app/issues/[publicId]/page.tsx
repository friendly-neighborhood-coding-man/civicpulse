import Link from "next/link";
import { notFound } from "next/navigation";

import ChannelCard from "@/components/ChannelCard";
import { getDb } from "@/lib/db/connection";
import { categoryLabel } from "@/lib/domain/areas";
import { getChannel, toPublicChannel } from "@/lib/domain/channels";
import { getPublicReport } from "@/lib/domain/publication";
import { ApiError } from "@/lib/http/errors";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ publicId: string }> };

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "long",
    timeZone: "Asia/Seoul",
  }).format(date);
}

export default async function PublicIssuePage({ params }: PageProps) {
  const { publicId } = await params;
  const db = getDb();

  let report;
  try {
    report = getPublicReport(db, publicId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const channel = getChannel(report.channelId);

  return (
    <div className="container-page py-10 sm:py-14">
      <nav className="text-xs text-muted">
        <Link href="/" className="hover:text-ink">
          홈
        </Link>
        <span aria-hidden> / </span>
        <span className="text-ink-soft">공개 제보</span>
      </nav>

      <article className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-info/25 bg-info-soft px-2.5 py-1 text-[11px] font-semibold text-info">
              시민 제보 · 공식 확인 아님
            </span>
            <span className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-muted">
              {report.areaLabel} · {categoryLabel(report.category)}
            </span>
          </div>

          <h1 className="mt-3 text-3xl leading-tight font-bold text-ink sm:text-4xl">
            {report.title}
          </h1>
          <p className="mt-2 text-xs text-muted">
            공개일 {formatDate(report.publishedAt)} · 위치는 구역 단위로만 표시됩니다
          </p>

          <div className="card mt-6 overflow-hidden">
            {/* Public, redacted copy only — served from the public storage scope. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={report.photoUrl}
              alt="가림 처리된 제보 사진"
              className="max-h-[520px] w-full bg-surface-muted object-contain"
            />
            <p className="border-t border-line px-4 py-3 text-[11px] leading-relaxed text-muted">
              공개용으로 다시 만든 사진입니다. 원본 사진·촬영 위치 정보는
              공개되지 않습니다. 가림 처리 {report.maskCount}곳.
            </p>
          </div>

          <div className="mt-6 rounded-2xl border border-line bg-surface p-6">
            <h2 className="text-sm font-semibold text-ink">제보 내용</h2>
            <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-ink-soft">
              {report.description}
            </p>
          </div>

          <div className="mt-5 rounded-2xl border border-warn/30 bg-warn-soft p-5 text-xs leading-relaxed text-warn">
            이 제보는 시민이 작성한 내용이며, 공식 기관의 확인이나 처리 결과가
            아닙니다. 지지 수나 공개 여부는 사실 판정이 아닙니다. CivicPulse는
            어떤 기관에도 자동으로 신고하지 않습니다.
          </div>
        </div>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-sm font-semibold text-ink">이 기록의 상태</h2>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">공식 확인</dt>
                <dd className="font-medium text-ink">없음</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">처리 상태</dt>
                <dd className="font-medium text-ink">검증되지 않음</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">위치 정밀도</dt>
                <dd className="font-medium text-ink">구역 단위</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">원본 공개</dt>
                <dd className="font-medium text-ink">안 함</dd>
              </div>
            </dl>
            <p className="mt-3 text-[11px] leading-relaxed text-muted">
              앞으로 공식 답변이나 시민의 추가 근거가 쌓이면 구분해서 표시할
              예정입니다. 현재는 공식 상태 정보가 없습니다.
            </p>
          </section>

          <ChannelCard channel={channel ? toPublicChannel(channel) : null} />

          <section className="rounded-2xl border border-dashed border-line-strong bg-surface-muted p-5">
            <h2 className="text-sm font-semibold text-ink">이웃과 함께하기</h2>
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">
              지지 표시, 추가 근거, 처리 경과 기록은 다음 단계에서 제공됩니다.
              현재는 공개된 기록을 읽을 수만 있습니다.
            </p>
          </section>
        </aside>
      </article>
    </div>
  );
}
