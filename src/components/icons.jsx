// Small line icons for the top row (Stacia, 2026-11-14). Drawn in the text
// colour, hidden from screen readers — every button that uses one also says
// what it does in words or in its aria-label.

const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
}

export function FilterIcon() {
  return (
    <svg {...base}>
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  )
}

export function SortIcon() {
  return (
    <svg {...base}>
      <path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4" />
    </svg>
  )
}

export function UserIcon() {
  return (
    <svg {...base}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  )
}
