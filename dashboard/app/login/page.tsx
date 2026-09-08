import { Suspense } from 'react';
import { LoginForm } from './LoginForm';

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <svg width="36" height="36" viewBox="0 0 120 120" aria-hidden="true">
            <g stroke="#fffc00" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" fill="none">
              <path d="M8,34 L8,8 L34,8" />
              <path d="M86,8 L112,8 L112,34" />
              <path d="M8,86 L8,112 L34,112" />
              <path d="M112,86 L112,112 L86,112" />
              <line x1="52" y1="60" x2="68" y2="60" strokeWidth="7" />
              <circle cx="44" cy="60" r="9" fill="#fffc00" stroke="none" />
              <circle cx="76" cy="60" r="9" fill="#fffc00" stroke="none" />
            </g>
          </svg>
          <div>
            <h1 className="font-display text-[22px] font-extrabold leading-none">
              Tagit <span className="text-snap">ops</span>
            </h1>
            <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-faint">
              Internal — not for public access
            </p>
          </div>
        </div>

        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
