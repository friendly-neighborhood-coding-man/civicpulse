import Link from "next/link";

import IdentitySwitcher from "@/components/IdentitySwitcher";
import { getSessionUser } from "@/lib/auth/session";
import { getAssistantMode } from "@/lib/config";
import { getDb, getSchemaVersion } from "@/lib/db/connection";
import { listOwnerReports } from "@/lib/domain/reports";
import { listUsers } from "@/lib/domain/users";

export const dynamic = "force-dynamic";

const STEPS = [
  {
    step: "01",
    title: "기록",
    body: "사진, 대략적인 위치, 짧은 설명으로 제보 초안을 만듭니다. 초안은 편집 가능하고, 위치는 공개 범위를 따로 정합니다.",
    status: "사용 가능",
  },
  {
    step: "02",
    title: "검토와 공유",
    body: "도우미가 만든 문장은 사람이 고칩니다. 얼굴·번호판 가림을 눈으로 확인한 뒤에만 공개할 수 있습니다.",
    status: "사용 가능",
  },
  {
    step: "03",
    title: "추적과 후속",
    body: "공개된 기록에 지지를 표시하고, 검토를 거친 추가 근거와 출처가 붙은 공식 상태를 쌓습니다. 대기 기간과 새 근거가 충분하면 사람이 검토하는 후속 요청 초안을 만듭니다.",
    status: "사용 가능",
  },
];

const TRUST_LEVELS = [
  {
    label: "공식 확인",
    tone: "bg-accent-soft text-accent-strong border-accent/25",
    body: "공공기관의 답변이나 공개 자료에 근거한 상태. 출처와 확인 시점을 함께 표시합니다.",
  },
  {
    label: "시민 주장",
    tone: "bg-info-soft text-info border-info/25",
    body: "제보자나 참여자가 주장하는 내용. 사실로 승격되지 않으며 검증 주체를 명시합니다.",
  },
  {
    label: "검증되지 않음",
    tone: "bg-surface-muted text-ink-soft border-line-strong",
    body: "아직 아무도 확인하지 않은 기본 상태입니다. 추정으로 채우지 않습니다.",
  },
  {
    label: "모의 데이터",
    tone: "bg-warn-soft text-warn border-warn/25",
    body: "데모용으로 만들어진 값. 실제 기관의 처리 결과처럼 표시하지 않습니다.",
  },
];

export default async function HomePage() {
  const db = getDb();
  const user = await getSessionUser(db);
  const users = listUsers(db);
  const schemaVersion = getSchemaVersion(db);
  const assistantMode = getAssistantMode();
  const myReports = user ? listOwnerReports(db, user).slice(0, 2) : [];

  return (
    <>
      <section className="container-page grid gap-10 pt-12 pb-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-start lg:gap-14 lg:pt-20">
        <div>
          <p className="label-caps text-accent">CivicPulse · 해커톤 프로토타입</p>
          <h1 className="mt-4 text-[2.1rem] leading-[1.15] font-bold text-ink sm:text-5xl">
            동네의 문제를,
            <br />
            기록에서 후속 요청까지.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-soft sm:text-lg">
            사진과 대략적인 위치, 짧은 설명만으로 제보 초안을 만듭니다. 공개
            여부는 직접 검토해 결정하고, 처리 과정과 근거는 한곳에서 추적합니다.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            {user ? (
              <Link
                href="/reports/new"
                className="inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent-strong"
              >
                새 제보 시작하기
              </Link>
            ) : (
              <a
                href="#identity"
                className="inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent-strong"
              >
                데모 사용자로 시작하기
              </a>
            )}
            <Link
              href="/issues"
              className="inline-flex h-11 items-center rounded-full border border-line bg-surface px-5 text-sm font-semibold text-ink transition hover:border-line-strong"
            >
              공개 제보 둘러보기
            </Link>
            <a
              href="#limits"
              className="inline-flex h-11 items-center rounded-full px-2 text-sm font-semibold text-muted underline underline-offset-4 transition hover:text-ink"
            >
              경계 보기
            </a>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
              실제 신고 전송 없음
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
              합성 데이터만 사용
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
              공개는 선택 사항
            </span>
          </div>
        </div>

        <div
          id="identity"
          className="card scroll-mt-24 p-6 sm:p-7"
          aria-labelledby="identity-heading"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="identity-heading" className="text-lg font-semibold text-ink">
                데모 세션
              </h2>
              <p className="mt-1 text-sm text-muted">
                사용자 역할에 따라 보이는 범위가 달라집니다.
              </p>
            </div>
            <span className="rounded-full border border-warn/30 bg-warn-soft px-2.5 py-1 text-[11px] font-semibold text-warn">
              모의 로그인
            </span>
          </div>

          <div className="mt-5">
            <IdentitySwitcher users={users} currentUser={user} variant="panel" />
          </div>

          {user ? (
            <div className="mt-5 space-y-3">
              <p className="rounded-xl border border-line bg-surface-muted px-3 py-2 text-xs text-ink-soft">
                현재 세션: <strong className="font-semibold">{user.displayName}</strong>{" "}
                (@{user.handle})
              </p>
              <div className="rounded-xl border border-line px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-ink">최근 초안</p>
                  <Link
                    href="/reports"
                    className="text-[11px] font-medium text-muted underline underline-offset-4 hover:text-ink"
                  >
                    전체 보기
                  </Link>
                </div>
                {myReports.length === 0 ? (
                  <p className="mt-2 text-[11px] text-muted">
                    아직 없습니다. 샘플 사진으로 시작할 수 있습니다.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {myReports.map((report) => (
                      <li key={report.publicId}>
                        <Link
                          href={`/reports/${report.publicId}`}
                          className="line-clamp-1 text-[11px] text-ink-soft underline-offset-4 hover:text-ink hover:underline"
                        >
                          비공개 초안 · {report.title || report.areaLabel}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section
        id="how"
        className="container-page scroll-mt-20 border-t border-line pt-14 pb-16"
        aria-labelledby="how-heading"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label-caps text-muted">작동 방식</p>
            <h2 id="how-heading" className="mt-2 text-2xl font-bold text-ink sm:text-3xl">
              한 건의 제보가 남기는 기록
            </h2>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-muted">
            모든 단계에서 사람의 확인이 먼저입니다. 자동화는 초안 작성과 정리를
            돕는 역할까지만 맡습니다.
          </p>
        </div>

        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map((item) => (
            <li key={item.step} className="card flex flex-col gap-3 p-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold tracking-widest text-accent">
                  {item.step}
                </span>
                <span className="rounded-full border border-line bg-surface-muted px-2 py-1 text-[11px] font-medium text-muted">
                  {item.status}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-ink">{item.title}</h3>
              <p className="text-sm leading-relaxed text-ink-soft">{item.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section
        className="container-page border-t border-line py-14"
        aria-labelledby="trust-heading"
      >
        <p className="label-caps text-muted">데이터 신뢰 구분</p>
        <h2 id="trust-heading" className="mt-2 text-2xl font-bold text-ink sm:text-3xl">
          공식 정보와 시민 주장을 섞지 않습니다
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          화면과 저장소 모두에서 같은 구분을 사용합니다. 지지 수는 사실 판정이
          아니라 참여 표시일 뿐입니다.
        </p>

        <dl className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST_LEVELS.map((level) => (
            <div key={level.label} className="card p-5">
              <dt>
                <span
                  className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${level.tone}`}
                >
                  {level.label}
                </span>
              </dt>
              <dd className="mt-3 text-sm leading-relaxed text-ink-soft">
                {level.body}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        id="limits"
        className="container-page scroll-mt-20 border-t border-line py-14"
        aria-labelledby="limits-heading"
      >
        <div className="card overflow-hidden">
          <div className="grid gap-8 p-7 sm:p-9 lg:grid-cols-[1fr_1fr]">
            <div>
              <p className="label-caps text-warn">안전 경계</p>
              <h2 id="limits-heading" className="mt-2 text-2xl font-bold text-ink">
                이 프로토타입이 하지 않는 일
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                민원은 시민의 권리에 관한 일입니다. 자동화가 대신 결정하거나
                전송하지 않도록 설계했습니다.
              </p>
            </div>
            <ul className="space-y-3 text-sm leading-relaxed text-ink-soft">
              <li className="flex gap-3">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
                실제 신고·민원·이메일을 자동으로 전송하지 않습니다. 최종 제출은
                사용자가 확인된 공식 창구에서 직접 합니다.
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
                확인되지 않은 기관 연락처나 처리 결과를 만들지 않습니다.
                출처가 없으면 &ldquo;확인되지 않음&rdquo;으로 표시합니다.
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
                공개 게시물에는 원본 사진, 정확한 좌표, EXIF 정보를 포함하지
                않습니다. 공개는 명시적 동의 이후에만 이루어집니다.
              </li>
            </ul>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line bg-surface-muted/60 px-7 py-3 text-[11px] text-muted sm:px-9">
            <span>스키마 v{schemaVersion}</span>
            <span>저장소: 로컬 SQLite</span>
            <span>
              초안 엔진: {assistantMode === "mock" ? "규칙 기반(모의)" : "외부 모델"}
            </span>
            <span>실제 외부 전송: 없음</span>
          </div>
        </div>
      </section>
    </>
  );
}
