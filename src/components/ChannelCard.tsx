import type { PublicChannel } from "@/lib/domain/channels";

type Props = { channel: PublicChannel | null };

/**
 * Verified official route, or an explicit "not verified" state.
 * This card never offers a submit button: the citizen completes the report in
 * the official portal themselves.
 */
export default function ChannelCard({ channel }: Props) {
  if (!channel) {
    return (
      <div className="rounded-2xl border border-line bg-surface-muted p-5">
        <p className="text-[11px] font-semibold tracking-wide text-muted">
          공식 창구
        </p>
        <p className="mt-2 text-sm font-semibold text-ink">확인된 공식 창구 없음</p>
        <p className="mt-2 text-xs leading-relaxed text-ink-soft">
          이 유형에 대해 출처가 확인된 접수 창구를 아직 등록하지 않았습니다.
          담당 기관을 추정하거나 연락처를 만들어 안내하지 않습니다. 관할
          지방자치단체에 직접 문의해 주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-accent/25 bg-accent-soft/60 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-accent-strong">
            공식 창구 · 출처 확인
          </p>
          <p className="mt-1 text-base font-semibold text-ink">{channel.name}</p>
          <p className="text-xs text-muted">{channel.operator}</p>
        </div>
        <span className="rounded-full border border-accent/30 bg-white px-2 py-1 text-[10px] font-semibold text-accent-strong">
          {channel.asOf} 확인
        </span>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-ink-soft">{channel.whatToExpect}</p>

      <a
        href={channel.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex h-10 items-center rounded-full bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-strong"
      >
        공식 창구 열기 ↗
      </a>

      <p className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-[11px] leading-relaxed text-ink-soft">
        {channel.limitations}
      </p>

      <p className="mt-3 text-[11px] text-muted">
        출처:{" "}
        <a
          href={channel.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-ink"
        >
          {channel.sourceLabel}
        </a>{" "}
        · {channel.asOf} 기준
      </p>
    </div>
  );
}
