import Link from "next/link";
import { notFound } from "next/navigation";

import ChannelCard from "@/components/ChannelCard";
import IssueEngagement from "@/components/IssueEngagement";
import { getSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/connection";
import { categoryLabel } from "@/lib/domain/areas";
import { getChannel, toPublicChannel } from "@/lib/domain/channels";
import { getIssueDetail, type PublicStatusEvent } from "@/lib/domain/community";
import { getPublishedReportRow } from "@/lib/domain/publication";
import { ApiError } from "@/lib/http/errors";
import { KIND_LABEL, STATUS_LABEL, type StatusKind } from "@/lib/validation/community";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ publicId: string }> };

const KIND_STYLE: Record<StatusKind, string> = {
  official_source: "border-accent/30 bg-accent-soft text-accent-strong",
  moderator_claim: "border-warn/30 bg-warn-soft text-warn",
  user_claim: "border-info/25 bg-info-soft text-info",
  mock: "border-dashed border-info/30 bg-info-soft text-info",
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "long",
    timeZone: "Asia/Seoul",
  }).format(date);
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(date);
}

function EventCard({ event }: { event: PublicStatusEvent }) {
  return (
    <li className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${KIND_STYLE[event.kind]}`}
        >
          {KIND_LABEL[event.kind]}
        </span>
        <span className="text-xs font-medium text-ink">
          {STATUS_LABEL[event.status]}
        </span>
        <span className="text-[11px] text-muted">{formatDateTime(event.createdAt)}</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed whitespace-pre-line text-ink-soft">
        {event.note}
      </p>
      {event.sourceUrl ? (
        <a
          href={event.sourceUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-1 inline-block text-[11px] text-accent-strong underline underline-offset-2"
        >
          출처 열기 ↗
        </a>
      ) : null}
    </li>
  );
}

export default async function PublicIssuePage({ params }: PageProps) {
  const { publicId } = await params;
  const db = getDb();
  const viewer = await getSessionUser(db);

  let issue;
  try {
    issue = getIssueDetail(db, publicId, viewer);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  // Ownership is only used to decide which UI to render; it is never serialised
  // into the public projection.
  const ownerId = getPublishedReportRow(db, publicId).owner_id;
  const channel = getChannel(issue.channelId);
  const officialEvent =
    [...issue.events].reverse().find((event) => event.kind === "official_source") ??
    null;
  const moderatorEvent =
    [...issue.events]
      .reverse()
      .find((event) => event.kind === "moderator_claim") ?? null;

  return (
    <div className="container-page py-10 sm:py-14">
      <nav className="text-xs text-muted">
        <Link href="/" className="hover:text-ink">
          홈
        </Link>
        <span aria-hidden> / </span>
        <Link href="/issues" className="hover:text-ink">
          공개 제보
        </Link>
        <span aria-hidden> / </span>
        <span className="text-ink-soft">{issue.publicId}</span>
      </nav>

      <article className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-info/25 bg-info-soft px-2.5 py-1 text-[11px] font-semibold text-info">
              시민 제보 · 공식 확인 아님
            </span>
            <span className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-muted">
              {issue.areaLabel} · {categoryLabel(issue.category)}
            </span>
          </div>

          <h1 className="mt-3 text-3xl leading-tight font-bold text-ink sm:text-4xl">
            {issue.title}
          </h1>
          <p className="mt-2 text-xs text-muted">
            공개일 {formatDate(issue.publishedAt)} · 지지 {issue.supportCount}명 · 위치는
            구역 단위로만 표시됩니다
          </p>

          <div className="card mt-6 overflow-hidden">
            {/* Public, redacted copy only — served from the public storage scope. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={issue.photoUrl}
              alt="가림 처리된 제보 사진"
              className="max-h-[520px] w-full bg-surface-muted object-contain"
            />
            <p className="border-t border-line px-4 py-3 text-[11px] leading-relaxed text-muted">
              공개용으로 다시 만든 사진입니다. 원본 사진·촬영 위치 정보는 공개되지
              않습니다. 가림 처리 {issue.maskCount}곳.
            </p>
          </div>

          <div className="mt-6 rounded-2xl border border-line bg-surface p-6">
            <h2 className="text-sm font-semibold text-ink">제보 내용</h2>
            <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-ink-soft">
              {issue.description}
            </p>
          </div>

          <section aria-labelledby="evidence-heading" className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="evidence-heading" className="text-sm font-semibold text-ink">
                이웃이 보탠 근거
              </h2>
              <span className="text-[11px] text-muted">
                운영자 검토를 통과한 근거만 표시됩니다
              </span>
            </div>
            {issue.evidence.length === 0 ? (
              <p className="mt-3 rounded-2xl border border-dashed border-line-strong bg-surface-muted p-5 text-xs leading-relaxed text-muted">
                아직 공개된 추가 근거가 없습니다. 새 근거는 운영자 검토 전까지
                공개되지 않습니다.
              </p>
            ) : (
              <ul className="mt-3 grid gap-4 sm:grid-cols-2">
                {issue.evidence.map((item) => (
                  <li key={item.id} className="card overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.photoUrl}
                      alt="이웃이 추가한 근거 사진"
                      className="h-44 w-full bg-surface-muted object-cover"
                    />
                    <div className="p-4">
                      <p className="text-xs leading-relaxed whitespace-pre-line text-ink-soft">
                        {item.note}
                      </p>
                      <p className="mt-2 text-[11px] text-muted">
                        시민 추가 근거 · {formatDateTime(item.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="mt-5 rounded-2xl border border-warn/30 bg-warn-soft p-5 text-xs leading-relaxed text-warn">
            이 제보는 시민이 작성한 내용이며, 공식 기관의 확인이나 처리 결과가
            아닙니다. 지지 수나 공개 여부는 사실 판정이 아닙니다. CivicPulse는 어떤
            기관에도 자동으로 신고하지 않습니다.
          </div>
        </div>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-sm font-semibold text-ink">이 기록의 상태</h2>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">공식 포털 인용</dt>
                <dd className="text-right font-medium text-ink">
                  {issue.officialStatus ? STATUS_LABEL[issue.officialStatus] : "없음"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">사건 단위 확인</dt>
                <dd className="text-right font-medium text-warn">
                  {issue.officialReference ? "안 됨 (도메인만 확인)" : "해당 없음"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">운영자 기록(미검증)</dt>
                <dd className="text-right font-medium text-ink">
                  {issue.latestModeratorClaim
                    ? STATUS_LABEL[issue.latestModeratorClaim.status]
                    : "없음"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">시민 주장</dt>
                <dd className="text-right font-medium text-ink">
                  {issue.latestUserClaim
                    ? STATUS_LABEL[issue.latestUserClaim.status]
                    : "없음"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">지지</dt>
                <dd className="font-medium text-ink">{issue.supportCount}명</dd>
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
              &lsquo;공식 포털 인용&rsquo;은 운영자가 등록된 공식 포털 도메인의 주소를
              인용해 기록한 경우에만 표시됩니다. 도메인만 확인하며, 해당 사건의 접수·
              처리·해결 여부나 인용한 페이지의 내용은 확인하지 않습니다. 정부 시스템과
              자동으로 연동된 기록도 아닙니다. 나머지 운영자 기록은 미검증으로
              구분되고, 시민 주장은 작성자의 관찰입니다.
            </p>
            {officialEvent ? (
              <a
                href={officialEvent.sourceUrl ?? undefined}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="mt-3 inline-block text-[11px] font-medium text-accent-strong underline underline-offset-2"
              >
                인용한 포털 열기 ↗
              </a>
            ) : null}
            {issue.officialSourceCheckedAt ? (
              <p className="mt-1 text-[10px] text-muted">
                포털 확인 기준일 {issue.officialSourceCheckedAt}
                {issue.officialSourceHost ? ` · ${issue.officialSourceHost}` : ""}
              </p>
            ) : null}
            {moderatorEvent ? (
              <p className="mt-2 text-[10px] leading-relaxed text-warn">
                미검증 운영자 기록
                {moderatorEvent.sourceHost ? ` · 출처 ${moderatorEvent.sourceHost}` : ""}
              </p>
            ) : null}
          </section>

          <IssueEngagement
            publicId={issue.publicId}
            supportCount={issue.supportCount}
            supportedByMe={issue.supportedByMe}
            signedIn={Boolean(viewer)}
            isOwner={Boolean(viewer && viewer.id === ownerId)}
            isModerator={viewer?.role === "moderator"}
          />

          <ChannelCard channel={channel ? toPublicChannel(channel) : null} />
        </aside>
      </article>

      <section aria-labelledby="timeline-heading" className="mt-10">
        <h2 id="timeline-heading" className="text-sm font-semibold text-ink">
          처리 경과
        </h2>
        <p className="mt-1 text-[11px] text-muted">
          공식 확인과 시민 주장을 구분해 시간순으로 표시합니다.
        </p>
        {issue.events.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-line-strong bg-surface-muted p-5 text-xs leading-relaxed text-muted">
            아직 기록된 처리 경과가 없습니다. 공식 답변이 확인되면 출처와 함께
            표시됩니다.
          </p>
        ) : (
          <ol className="mt-3 space-y-3">
            {issue.events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
