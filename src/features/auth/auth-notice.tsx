import type { ReactNode } from 'react';

export type AuthNoticeTone = 'success' | 'warning' | 'danger';

const SUCCESS_MESSAGES = new Set([
  'checkEmail',
  'resetEmailSent',
  'passwordUpdated',
]);

const WARNING_MESSAGES = new Set([
  'confirmFirst',
  'oauthCancelled',
  'unavailable',
]);

export function getAuthNoticeTone(message: string): AuthNoticeTone {
  if (SUCCESS_MESSAGES.has(message)) return 'success';
  if (WARNING_MESSAGES.has(message)) return 'warning';
  return 'danger';
}

export function AuthNotice({
  message,
  role,
  children,
}: {
  message: string;
  role?: 'status' | 'alert';
  children: ReactNode;
}) {
  const tone = getAuthNoticeTone(message);
  const resolvedRole =
    role ?? (tone === 'success' || message === 'unavailable' ? 'status' : 'alert');

  return (
    <div
      role={resolvedRole}
      className={`form-notice form-notice-rich form-notice-${tone}`}
    >
      <AuthNoticeIcon tone={tone} />
      <span className="form-notice-body">{children}</span>
    </div>
  );
}

function AuthNoticeIcon({ tone }: { tone: AuthNoticeTone }) {
  if (tone === 'success') {
    return (
      <svg
        className="form-notice-icon"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.75" />
        <path
          d="M6.6 10.2 8.9 12.5 13.5 7.8"
          stroke="currentColor"
          strokeWidth="1.85"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (tone === 'warning') {
    return (
      <svg
        className="form-notice-icon"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.75" />
        <path
          d="M10 6.3v4.2"
          stroke="currentColor"
          strokeWidth="1.85"
          strokeLinecap="round"
        />
        <circle cx="10" cy="13.5" r="1" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg
      className="form-notice-icon"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M10 6.2v4.4"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
      />
      <circle cx="10" cy="13.6" r="1" fill="currentColor" />
    </svg>
  );
}

export function AuthSpinner() {
  return (
    <svg
      className="auth-spinner"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeOpacity="0.28"
        strokeWidth="2"
      />
      <path
        d="M14 8a6 6 0 0 0-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
