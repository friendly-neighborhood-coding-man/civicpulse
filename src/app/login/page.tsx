import Link from "next/link";

import LoginForm from "@/components/LoginForm";
import { getAuthMode } from "@/lib/auth/mode";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const mode = getAuthMode();

  return (
    <div className="container-page py-14">
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-bold text-ink">로그인</h1>
        {mode === "password" ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              운영자가 발급한 이메일과 비밀번호로 로그인합니다. CivicPulse는 이
              배포에서 공개 회원가입을 제공하지 않습니다.
            </p>
            <div className="card mt-6 p-6">
              <LoginForm />
            </div>
          </>
        ) : (
          <div className="card mt-6 p-6">
            <p className="text-sm leading-relaxed text-ink-soft">
              이 배포는 <strong>데모 모드</strong>입니다. 비밀번호 계정 대신 상단의
              합성 사용자 전환을 사용합니다. 실제 인증이 아닙니다.
            </p>
            <Link
              href="/"
              className="mt-4 inline-flex h-10 items-center rounded-full bg-accent px-4 text-sm font-semibold text-white"
            >
              데모로 돌아가기
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
