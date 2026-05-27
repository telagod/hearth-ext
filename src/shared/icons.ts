/**
 * Hearth icon set — vector-only.
 * Style: 24x24 viewBox, 1.6 stroke, round caps/joins.
 * Inspired by Lucide & Phosphor; tweaked for the hearth aesthetic.
 *
 * Use `iconSvg(name)` to get a static SVG string (Shadow DOM, content scripts).
 * Use the React `<Icon name="..."/>` component in sidepanel views.
 */

export type IconName =
  | 'brand'
  | 'save'        // bookmark-style
  | 'spark'       // ask AI (sparkles, not robot)
  | 'thread'      // link/relate (threads)
  | 'feather'     // annotate
  | 'flame'       // recall orb
  | 'leaf'        // privacy / moss
  | 'clip'        // clipboard
  | 'eye'         // read signal
  | 'image'       // image OCR
  | 'tab'         // tab close
  | 'search'
  | 'star'
  | 'archive'
  | 'tag'
  | 'check'
  | 'cross'
  | 'shield'
  | 'gear';

const PATHS: Record<IconName, string> = {
  brand: `
    <path d="M3 11 Q3 9 5 9 L19 9 Q21 9 21 11 L20 16 Q19 20 16 20 L8 20 Q5 20 4 16 Z"
      fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M12 3 C9 7 8 9 9 12 C9.6 14 11 14.6 12 14.6 C13 14.6 14.4 14 15 12 C16 9 15 7 12 3 Z"
      fill="currentColor"/>
  `,

  // 📎 → bookmark (chosen over paperclip; reads as "save this")
  save: `
    <path d="M7 4 L17 4 Q18 4 18 5 L18 20 L12 16 L6 20 L6 5 Q6 4 7 4 Z"
      fill="none" stroke="currentColor" stroke-width="1.6"
      stroke-linejoin="round" stroke-linecap="round"/>
  `,

  // 🤖 → sparkles (LLM intent without robot face)
  spark: `
    <path d="M12 3 L13.5 8.2 L18.5 9.5 L13.5 10.8 L12 16 L10.5 10.8 L5.5 9.5 L10.5 8.2 Z"
      fill="currentColor"/>
    <path d="M19 14 L19.7 16 L21.5 16.6 L19.7 17.2 L19 19.2 L18.3 17.2 L16.5 16.6 L18.3 16 Z"
      fill="currentColor" opacity="0.7"/>
    <path d="M5 17 L5.6 18.6 L7 19.1 L5.6 19.6 L5 21 L4.4 19.6 L3 19.1 L4.4 18.6 Z"
      fill="currentColor" opacity="0.55"/>
  `,

  // 🔗 → threads (two interlocking arcs, more "relating" than chain link)
  thread: `
    <path d="M8 7 Q4 7 4 11 Q4 15 8 15 L11 15"
      fill="none" stroke="currentColor" stroke-width="1.6"
      stroke-linecap="round"/>
    <path d="M16 9 L13 9 Q9 9 9 13 Q9 17 13 17 L16 17"
      fill="none" stroke="currentColor" stroke-width="1.6"
      stroke-linecap="round" opacity="0.5"/>
    <path d="M16 17 Q20 17 20 13 Q20 9 16 9"
      fill="none" stroke="currentColor" stroke-width="1.6"
      stroke-linecap="round"/>
  `,

  // 💭 → feather (private note, slower, more intimate)
  feather: `
    <path d="M19 5 Q14 5 10 9 Q6 13 6 18 L7.5 16.5 Q11 13 14 12 Q11 14 9 17 L11 17 Q15 17 18 14 Q21 11 21 7 Q21 5 19 5 Z"
      fill="none" stroke="currentColor" stroke-width="1.6"
      stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M6 18 L4 20"
      stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  `,

  // recall orb glyph
  flame: `
    <path d="M12 3 C9 7 7.5 10 8 13 Q9 17 12 18 Q15 17 16 13 C16.5 10 15 7 12 3 Z"
      fill="currentColor"/>
    <path d="M12 9 C10.6 11 10 12.5 10.4 14 Q11 16 12 16 Q13 16 13.6 14 C14 12.5 13.4 11 12 9 Z"
      fill="rgba(255,255,255,0.55)"/>
  `,

  leaf: `
    <path d="M5 19 Q5 9 14 5 Q19 4 19 9 Q19 18 9 19 Q5 19 5 19 Z"
      fill="none" stroke="currentColor" stroke-width="1.6"
      stroke-linejoin="round"/>
    <path d="M14 8 Q10 12 7 18"
      fill="none" stroke="currentColor" stroke-width="1.4"
      stroke-linecap="round"/>
  `,

  clip: `
    <rect x="6" y="4" width="12" height="17" rx="1.6"
      fill="none" stroke="currentColor" stroke-width="1.6"/>
    <path d="M9 4 Q9 2.5 10.5 2.5 L13.5 2.5 Q15 2.5 15 4"
      fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  `,

  eye: `
    <path d="M2 12 Q7 5 12 5 Q17 5 22 12 Q17 19 12 19 Q7 19 2 12 Z"
      fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
    <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/>
  `,

  image: `
    <rect x="3" y="5" width="18" height="14" rx="2"
      fill="none" stroke="currentColor" stroke-width="1.6"/>
    <circle cx="9" cy="10" r="1.5" fill="currentColor"/>
    <path d="M3 17 L8 12 L13 16 L17 12 L21 17"
      fill="none" stroke="currentColor" stroke-width="1.6"
      stroke-linecap="round" stroke-linejoin="round"/>
  `,

  tab: `
    <rect x="3" y="6" width="14" height="14" rx="1.6"
      fill="none" stroke="currentColor" stroke-width="1.6"/>
    <path d="M7 6 L7 4 Q7 3 8 3 L18 3 Q19 3 19 4 L19 14 Q19 15 18 15 L17 15"
      fill="none" stroke="currentColor" stroke-width="1.6"
      stroke-linecap="round" stroke-linejoin="round"/>
  `,

  search: `
    <circle cx="11" cy="11" r="6.5"
      fill="none" stroke="currentColor" stroke-width="1.6"/>
    <path d="M16 16 L21 21" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  `,

  star: `
    <path d="M12 3.5 L14.6 9 L20.5 9.8 L16.2 13.9 L17.3 19.7 L12 16.9 L6.7 19.7 L7.8 13.9 L3.5 9.8 L9.4 9 Z"
      fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
  `,

  archive: `
    <rect x="3" y="5" width="18" height="4" rx="1"
      fill="none" stroke="currentColor" stroke-width="1.6"/>
    <path d="M5 9 L5 19 Q5 20 6 20 L18 20 Q19 20 19 19 L19 9"
      fill="none" stroke="currentColor" stroke-width="1.6"
      stroke-linejoin="round"/>
    <path d="M10 13 L14 13"
      stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  `,

  tag: `
    <path d="M11 3 L21 3 L21 13 L13 21 L3 11 Z"
      fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
    <circle cx="16.5" cy="7.5" r="1.4" fill="currentColor"/>
  `,

  check: `
    <path d="M5 12 L10 17 L19 7"
      fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round"/>
  `,

  cross: `
    <path d="M6 6 L18 18 M18 6 L6 18"
      stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  `,

  shield: `
    <path d="M12 3 L20 6 L20 12 Q20 18 12 21 Q4 18 4 12 L4 6 Z"
      fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M9 12 L11.4 14.4 L15 10.6"
      fill="none" stroke="currentColor" stroke-width="1.6"
      stroke-linecap="round" stroke-linejoin="round"/>
  `,

  gear: `
    <circle cx="12" cy="12" r="3"
      fill="none" stroke="currentColor" stroke-width="1.6"/>
    <path d="M12 2 L12 5 M12 19 L12 22 M2 12 L5 12 M19 12 L22 12
      M5 5 L7 7 M17 17 L19 19 M5 19 L7 17 M17 7 L19 5"
      stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  `,
};

export function iconSvg(name: IconName, size = 20, opts: { stroke?: string } = {}): string {
  const stroke = opts.stroke ?? 'currentColor';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${stroke}" aria-hidden="true">${PATHS[name]}</svg>`;
}

export const ICON_NAMES: IconName[] = Object.keys(PATHS) as IconName[];
