import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-start justify-center py-16">
      <p className="label-caps text-muted">404</p>
      <h1 className="mt-3 text-3xl font-bold text-ink">
        찾을 수 없는 페이지입니다
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-soft">
        주소가 잘못되었거나, 비공개 초안이라 접근할 수 없는 항목입니다. 비공개
        초안은 작성자에게만 표시되며, 존재 여부도 안내하지 않습니다.
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent-strong"
        >
          홈으로
        </Link>
        <Link
          href="/reports"
          className="inline-flex h-11 items-center rounded-full border border-line bg-surface px-5 text-sm font-semibold text-ink transition hover:border-line-strong"
        >
          내 제보
        </Link>
      </div>
    </div>
  );
}
