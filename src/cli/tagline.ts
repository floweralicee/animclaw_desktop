// All taglines must be film, animation, game, or production focused — no CRM/data/metal branding.
const DEFAULT_TAGLINE = "Your whole film team, one command away.";

const HOLIDAY_TAGLINES = {
  newYear:
    "New Year's Day: New year, fresh reels — same creative energy, now with fewer render crashes.",
  lunarNewYear:
    "Lunar New Year: May your shots be lucky, your storyboards prosperous, and your keyframes smooth.",
  christmas:
    "Christmas: Ho ho ho — your AI film crew is here to ship joy, roll credits, and deliver on time.",
  eid: "Eid al-Fitr: Celebration mode: scenes wrapped, shots approved, and good vibes committed to the cut.",
  diwali:
    "Diwali: Let the screen glow bright and the renders fly — today we light up the timeline and ship with pride.",
  easter:
    "Easter: I found your missing keyframe — consider it a tiny animation egg hunt with fewer jellybeans.",
  hanukkah:
    "Hanukkah: Eight nights, eight renders, zero shame — may your pipeline stay lit and your exports stay crisp.",
  halloween:
    "Halloween: Spooky season: beware haunted keyframes, cursed cache files, and the ghost of renders past.",
  thanksgiving:
    "Thanksgiving: Grateful for stable exports, working lip-sync, and an agent that reads the script so nobody has to.",
  valentines:
    "Valentine's Day: Roses are animated, violets are rendered — I'll handle the busywork so you can focus on the story.",
} as const;

const TAGLINES: string[] = [
  // Film & animation core
  "Your whole film team, one command away.",
  "Pre-production to post — AnimClaw handles it all.",
  "One prompt. Your entire crew. Zero drama.",
  "From script to storyboard in seconds.",
  "Your AI film crew, running locally.",
  "Anyone can make a film.",
  "The one-stop shop for filmmakers.",
  "Describe what you need. AnimClaw handles the rest.",
  "Director, writer, storyboard artist — all in one.",
  "One command launches your entire pre-production.",
  // Animation & motion
  "Prosody-driven animation that follows how real actors perform.",
  "Motion that breathes — not robotic, not evenly timed.",
  "From voice to lip-sync in one prompt.",
  "Keyframes that actually look human.",
  "Your characters, your story, your timeline.",
  "Animation that respects the beat.",
  "Stressed words, hold windows, natural motion.",
  "AI video that doesn't look like everyone else's.",
  // Game & creative
  "Level up your creative workflow.",
  "Unlock your creative potential.",
  "Your ideas, rendered.",
  "From concept to cut in minutes.",
  "Ship the vision. Skip the busywork.",
  "Creative tools for creative people.",
  "One prompt. Infinite possibilities.",
  "Your story deserves a whole crew.",
  // Light CLI wit (film-adjacent)
  "I'll do the boring stuff while you focus on the story.",
  "Welcome to the command line: where ideas compile and scenes come alive.",
  "Type the command with confidence — your film crew awaits.",
  "Hot reload for config, cold sweat for deadlines.",
  "If you can describe it, AnimClaw can probably make it.",
  "Your workspace, your rules, your film.",
  "End-to-end encrypted, drama-to-drama excluded.",
  "Local-first. Creator-first.",
  "Because the right shot is usually one prompt away.",
  // Production & pipeline
  "Shot lists, storyboards, and deliverables — all from one prompt.",
  "Your pre-production pipeline, automated.",
  "From pitch to post in one workspace.",
  "Film production without the chaos.",
  "Render-ready assets, script-ready breakdowns.",
  "Your creative pipeline, locally hosted.",
  // Holiday taglines (gated by date rules below)
  HOLIDAY_TAGLINES.newYear,
  HOLIDAY_TAGLINES.lunarNewYear,
  HOLIDAY_TAGLINES.christmas,
  HOLIDAY_TAGLINES.eid,
  HOLIDAY_TAGLINES.diwali,
  HOLIDAY_TAGLINES.easter,
  HOLIDAY_TAGLINES.hanukkah,
  HOLIDAY_TAGLINES.halloween,
  HOLIDAY_TAGLINES.thanksgiving,
  HOLIDAY_TAGLINES.valentines,
];

type HolidayRule = (date: Date) => boolean;

const DAY_MS = 24 * 60 * 60 * 1000;

function utcParts(date: Date) {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
  };
}

const onMonthDay =
  (month: number, day: number): HolidayRule =>
  (date) => {
    const parts = utcParts(date);
    return parts.month === month && parts.day === day;
  };

const onSpecificDates =
  (dates: Array<[number, number, number]>, durationDays = 1): HolidayRule =>
  (date) => {
    const parts = utcParts(date);
    return dates.some(([year, month, day]) => {
      if (parts.year !== year) {
        return false;
      }
      const start = Date.UTC(year, month, day);
      const current = Date.UTC(parts.year, parts.month, parts.day);
      return current >= start && current < start + durationDays * DAY_MS;
    });
  };

const inYearWindow =
  (
    windows: Array<{
      year: number;
      month: number;
      day: number;
      duration: number;
    }>,
  ): HolidayRule =>
  (date) => {
    const parts = utcParts(date);
    const window = windows.find((entry) => entry.year === parts.year);
    if (!window) {
      return false;
    }
    const start = Date.UTC(window.year, window.month, window.day);
    const current = Date.UTC(parts.year, parts.month, parts.day);
    return current >= start && current < start + window.duration * DAY_MS;
  };

const isFourthThursdayOfNovember: HolidayRule = (date) => {
  const parts = utcParts(date);
  if (parts.month !== 10) {
    return false;
  } // November
  const firstDay = new Date(Date.UTC(parts.year, 10, 1)).getUTCDay();
  const offsetToThursday = (4 - firstDay + 7) % 7; // 4 = Thursday
  const fourthThursday = 1 + offsetToThursday + 21; // 1st + offset + 3 weeks
  return parts.day === fourthThursday;
};

const HOLIDAY_RULES = new Map<string, HolidayRule>([
  [HOLIDAY_TAGLINES.newYear, onMonthDay(0, 1)],
  [
    HOLIDAY_TAGLINES.lunarNewYear,
    onSpecificDates(
      [
        [2025, 0, 29],
        [2026, 1, 17],
        [2027, 1, 6],
      ],
      1,
    ),
  ],
  [
    HOLIDAY_TAGLINES.eid,
    onSpecificDates(
      [
        [2025, 2, 30],
        [2025, 2, 31],
        [2026, 2, 20],
        [2027, 2, 10],
      ],
      1,
    ),
  ],
  [
    HOLIDAY_TAGLINES.diwali,
    onSpecificDates(
      [
        [2025, 9, 20],
        [2026, 10, 8],
        [2027, 9, 28],
      ],
      1,
    ),
  ],
  [
    HOLIDAY_TAGLINES.easter,
    onSpecificDates(
      [
        [2025, 3, 20],
        [2026, 3, 5],
        [2027, 2, 28],
      ],
      1,
    ),
  ],
  [
    HOLIDAY_TAGLINES.hanukkah,
    inYearWindow([
      { year: 2025, month: 11, day: 15, duration: 8 },
      { year: 2026, month: 11, day: 5, duration: 8 },
      { year: 2027, month: 11, day: 25, duration: 8 },
    ]),
  ],
  [HOLIDAY_TAGLINES.halloween, onMonthDay(9, 31)],
  [HOLIDAY_TAGLINES.thanksgiving, isFourthThursdayOfNovember],
  [HOLIDAY_TAGLINES.valentines, onMonthDay(1, 14)],
  [HOLIDAY_TAGLINES.christmas, onMonthDay(11, 25)],
]);

function isTaglineActive(tagline: string, date: Date): boolean {
  const rule = HOLIDAY_RULES.get(tagline);
  if (!rule) {
    return true;
  }
  return rule(date);
}

export interface TaglineOptions {
  env?: NodeJS.ProcessEnv;
  random?: () => number;
  now?: () => Date;
}

export function activeTaglines(options: TaglineOptions = {}): string[] {
  if (TAGLINES.length === 0) {
    return [DEFAULT_TAGLINE];
  }
  const today = options.now ? options.now() : new Date();
  const filtered = TAGLINES.filter((tagline) => isTaglineActive(tagline, today));
  return filtered.length > 0 ? filtered : TAGLINES;
}

export function pickTagline(options: TaglineOptions = {}): string {
  const env = options.env ?? process.env;
  // Check AnimClaw env first, fall back to legacy OpenClaw env
  const override = env?.ANIMCLAW_TAGLINE_INDEX ?? env?.OPENCLAW_TAGLINE_INDEX;
  if (override !== undefined) {
    const parsed = Number.parseInt(override, 10);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      const pool = TAGLINES.length > 0 ? TAGLINES : [DEFAULT_TAGLINE];
      return pool[parsed % pool.length];
    }
  }
  const pool = activeTaglines(options);
  const rand = options.random ?? Math.random;
  const index = Math.floor(rand() * pool.length) % pool.length;
  return pool[index];
}

export { TAGLINES, HOLIDAY_RULES, DEFAULT_TAGLINE };
