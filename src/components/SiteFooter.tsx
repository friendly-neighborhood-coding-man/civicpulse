export default function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line bg-surface/60">
      <div className="container-page flex flex-col gap-6 py-10 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xl space-y-2">
          <p className="text-sm font-semibold text-ink">CivicPulse</p>
          <p className="text-xs leading-relaxed text-muted">
            해커톤 프로토타입입니다. 공식 정부 서비스가 아니며, 실제 신고·민원을
            자동으로 전송하지 않습니다. 모든 예시는 합성 데이터입니다.
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
          <dt className="text-muted">데이터</dt>
          <dd className="font-medium text-ink">합성 데이터만</dd>
          <dt className="text-muted">저장소</dt>
          <dd className="font-medium text-ink">로컬 SQLite</dd>
          <dt className="text-muted">외부 전송</dt>
          <dd className="font-medium text-ink">없음</dd>
          <dt className="text-muted">공식 채널</dt>
          <dd className="font-medium text-ink">출처 확인 전 미표시</dd>
        </dl>
      </div>
    </footer>
  );
}
