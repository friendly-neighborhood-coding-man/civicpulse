import Link from "next/link";
import { notFound } from "next/navigation";

import ChannelCard from "@/components/ChannelCard";
import DemoSignInCard from "@/components/DemoSignInCard";
import DraftEditor from "@/components/DraftEditor";
import { getSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/connection";
import { getChannel, toPublicChannel } from "@/lib/domain/channels";
import { categoryLabel } from "@/lib/domain/areas";
import { getOwnedReportRow, toOwnerReport } from "@/lib/domain/reports";
import { getWorkingMedia } from "@/lib/domain/reports";
import { ApiError } from "@/lib/http/errors";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ publicId: string }> };

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(date);
}

export default async function ReportDraftPage({ params }: PageProps) {
  const { publicId } = await params;
  const user = await getSessionUser();

  if (!user) {
    return (
      <div className="container-page py-14">
        <DemoSignInCard
          heading="이 초안은 비공개입니다"
          body="초안은 작성자만 열람할 수 있습니다. 합성 데모 사용자를 선택해 주세요."
        />
      </div>
    );
  }

  const db = getDb();
  let report;
  try {
    const row = getOwnedReportRow(db, user, publicId);
    report = toOwnerReport(row, getWorkingMedia(db, row));
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
        <Link href="/reports" className="hover:text-ink">
          내 제보
        </Link>
        <span aria-hidden> / </span>
        <span className="text-ink-soft">{report.publicId}</span>
      </nav>

      <header className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-warn/30 bg-warn-soft px-2.5 py-1 text-[11px] font-semibold text-warn">
              비공개 초안
            </span>
            <span className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-muted">
              {report.areaLabel} · {categoryLabel(report.category)}
            </span>
            <span className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-muted">
              {report.publicId}
            </span>
          </div>
          <h1 className="mt-3 max-w-2xl text-2xl font-bold text-ink sm:text-3xl">
            {report.title || "제목 없는 초안"}
          </h1>
          <p className="mt-2 text-xs text-muted">
            만든 시각 {formatDateTime(report.createdAt)} · 마지막 수정{" "}
            {formatDateTime(report.updatedAt)}
          </p>
        </div>
        <Link
          href="/reports"
          className="inline-flex h-10 items-center rounded-full border border-line bg-surface px-4 text-sm font-medium text-ink transition hover:border-line-strong"
        >
          내 제보 목록
        </Link>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="card overflow-hidden">
            {report.photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- authenticated private route, cookies required
              <img
                src={report.photo.url}
                width={report.photo.width}
                height={report.photo.height}
                alt="제보 사진 (비공개)"
                className="max-h-[420px] w-full bg-surface-muted object-contain"
              />
            ) : (
              <div className="flex h-52 items-center justify-center bg-surface-muted text-sm text-muted">
                사진이 없습니다.
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-[11px] text-muted">
              <span>사진은 비공개 저장소에서 인증된 작성자에게만 표시됩니다.</span>
              <span>원본·정확한 좌표는 공개 화면에 사용하지 않습니다.</span>
            </div>
          </div>

          <section className="card p-6" aria-labelledby="edit-heading">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="edit-heading" className="text-lg font-semibold text-ink">
                초안 검토·수정
              </h2>
              <span className="rounded-full border border-line bg-surface-muted px-2.5 py-1 text-[11px] text-muted">
                편집 가능
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              보조 초안은 출발점입니다. 사실과 다르거나 빠진 내용은 직접 고쳐
              주세요. 저장하면 서버에 즉시 반영됩니다.
            </p>
            <div className="mt-5">
              <DraftEditor
                publicId={report.publicId}
                initialTitle={report.title}
                initialDescription={report.description}
                initialLandmark={report.landmark}
                updatedAt={report.updatedAt}
              />
            </div>
          </section>

          {report.userDescription ? (
            <section className="card p-6" aria-labelledby="original-heading">
              <h2 id="original-heading" className="text-sm font-semibold text-ink">
                내가 처음 쓴 설명
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-ink-soft">
                초안과 비교할 수 있도록 원문을 그대로 보관합니다.
              </p>
              <blockquote className="mt-3 rounded-xl border border-line bg-surface-muted px-4 py-3 text-sm leading-relaxed text-ink-soft">
                {report.userDescription}
              </blockquote>
            </section>
          ) : null}
        </div>

        <aside className="space-y-5" aria-label="초안 보조 정보">
          <section className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink">이 초안의 출처</h2>
              <span className="rounded-full border border-warn/30 bg-warn-soft px-2 py-1 text-[10px] font-semibold text-warn">
                모의 · 규칙 기반
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">
              사람이 작성한 설명을 정해진 문장 틀로 정리했습니다. 언어 모델이나
              외부 API를 호출하지 않았습니다.
            </p>
            <p className="mt-2 text-[11px] text-muted">
              생성 시각{" "}
              {report.assistant ? formatDateTime(report.assistant.generatedAt) : "-"}
            </p>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-sm font-semibold text-ink">추가로 있으면 좋은 근거</h2>
            <ul className="mt-3 space-y-2">
              {report.missingEvidence.map((item) => (
                <li key={item} className="flex gap-2 text-xs leading-relaxed text-ink-soft">
                  <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-line-strong" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] leading-relaxed text-muted">
              체크 표시는 &ldquo;확인했다&rdquo;는 뜻이 아닙니다. 실제로 준비된
              근거만 접수할 때 활용하세요.
            </p>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-sm font-semibold text-ink">접수 전에 할 일</h2>
            <ol className="mt-3 space-y-2">
              {report.suggestedSteps.map((step, index) => (
                <li key={step} className="flex gap-2 text-xs leading-relaxed text-ink-soft">
                  <span className="font-semibold text-muted">{index + 1}.</span>
                  {step}
                </li>
              ))}
            </ol>
          </section>

          <ChannelCard channel={channel ? toPublicChannel(channel) : null} />

          <section className="rounded-2xl border border-dashed border-line-strong bg-surface-muted p-5">
            <h2 className="text-sm font-semibold text-ink">다음 단계 · 아직 제공되지 않음</h2>
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">
              3단계에서 얼굴·번호판 가림을 검토하고 공개 여부를 결정합니다.
              이 화면에서는 공개할 수 없으며, 어떤 상태도 공개로 표시되지
              않습니다.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
