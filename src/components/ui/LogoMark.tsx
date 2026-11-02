/**
 * TerritoryIQ mark: three territories meeting at a point (the teal dot marks
 * the "selected" location). Keep in sync with src/app/icon.svg.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width="28"
      height="28"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect
        x="0.5"
        y="0.5"
        width="31"
        height="31"
        rx="8"
        fill="#EAF1FF"
        stroke="#C9D9F5"
      />
      <path
        d="M16 7.5 23.4 11.75v8.5L16 24.5l-7.4-4.25v-8.5Z"
        fill="none"
        stroke="#2563EB"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M16 16V7.5M16 16l7.4 4.25M16 16l-7.4 4.25"
        fill="none"
        stroke="#2563EB"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="2.25" fill="#0F8B78" />
    </svg>
  );
}
