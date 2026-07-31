export function HeroGraphic() {
  return (
    <svg
      aria-hidden="true"
      className="mt-12 h-auto w-full max-w-2xl text-foreground"
      fill="none"
      viewBox="0 0 640 280"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        className="fill-background stroke-border"
        height="224"
        rx="3"
        strokeWidth="1"
        width="544"
        x="48"
        y="28"
      />
      <path className="stroke-border" d="M48 76H592" strokeWidth="1" />
      <path className="stroke-border" d="M48 218H592" strokeWidth="1" />

      <g className="text-muted-foreground" opacity="0.75">
        <path d="M80 58H152" stroke="currentColor" strokeWidth="2" />
        <path d="M488 58H560" stroke="currentColor" strokeWidth="2" />
        <circle cx="88" cy="106" fill="currentColor" r="4" />
        <path d="M104 106H224" stroke="currentColor" strokeWidth="1" />
        <path d="M104 122H192" stroke="currentColor" strokeWidth="1" />
        <path d="M104 138H208" stroke="currentColor" strokeWidth="1" />
      </g>

      <g className="text-border" stroke="currentColor" strokeWidth="1">
        <path d="M280 104V190M332 104V190M384 104V190M436 104V190" />
        <path d="M256 190H468" />
      </g>

      <g className="text-muted-foreground" fill="currentColor" opacity="0.38">
        <rect height="34" rx="1" width="18" x="270" y="156" />
        <rect height="58" rx="1" width="18" x="322" y="132" />
        <rect height="46" rx="1" width="18" x="374" y="144" />
        <rect height="74" rx="1" width="18" x="426" y="116" />
      </g>

      <g className="text-foreground">
        <path
          d="M256 170C282 164 300 176 324 151C345 129 360 152 382 136C406 119 425 129 468 94"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <circle cx="468" cy="94" fill="currentColor" r="4" />
      </g>
    </svg>
  );
}
