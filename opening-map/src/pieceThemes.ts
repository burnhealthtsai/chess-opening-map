type Role = "king" | "queen" | "rook" | "bishop" | "knight" | "pawn";
type Side = "white" | "black";

const roles: Role[] = ["king", "queen", "rook", "bishop", "knight", "pawn"];
const sides: Side[] = ["white", "black"];

const palettes = {
  magic: ["#6f45be", "#e6bd52"],
  fairytale: ["#d95d9c", "#ffd16a"],
  "forest-anime": ["#34865b", "#8ebf5c"],
  warcraft: ["#5a626a", "#a7342e"],
  zombie: ["#668f45", "#b0c95a"],
  robot: ["#159cb8", "#83e7f2"],
  myth: ["#367ec3", "#e0ae36"],
  egypt: ["#12a8aa", "#d7a426"],
  india: ["#c83d75", "#f1a028"],
  china: ["#b9282c", "#e0ad35"],
  japan: ["#a91f2a", "#d1a43c"],
  europe: ["#31589e", "#d2a63d"],
} as const;

type Theme = keyof typeof palettes;

const rasterSets = [
  { id: "fairytale", folder: "fairytale-animation", whiteFilter: "invert(1) sepia(.12) saturate(.7) brightness(1.08)" },
  { id: "ceramic-storybook", folder: "ceramic-storybook", whiteFilter: "invert(1) sepia(.08) saturate(.55) brightness(1.08)" },
  { id: "neon-punk", folder: "neon-punk", whiteFilter: "hue-rotate(155deg) saturate(.82) brightness(1.38)" },
  { id: "egyptian-monument", folder: "egyptian-monument", whiteFilter: "invert(1) sepia(.22) saturate(.72) brightness(1.08)" },
] as const;
const rasterImages = import.meta.glob("./assets/pieces/**/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

function baseRole(role: Role, fill: string, stroke: string) {
  const common = `fill="${fill}" stroke="${stroke}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"`;
  const bodies: Record<Role, string> = {
    king: `<path ${common} d="M30 86h40l-4-10H34zM36 73c2-15 5-25 14-31 9 6 12 16 14 31z"/><path ${common} d="M50 9v27M40 19h20" fill="none"/>`,
    queen: `<path ${common} d="M29 86h42l-5-11H34zM36 72c2-17 7-27 14-34 7 7 12 17 14 34z"/><path ${common} d="M30 19l9 15 11-20 11 20 9-15-5 24H35z"/>`,
    rook: `<path ${common} d="M27 86h46l-5-11H32zM35 72h30l-3-34H38zM31 17h12v10h14V17h12v22H31z"/>`,
    bishop: `<path ${common} d="M28 86h44l-5-11H33zM36 72c1-14 7-25 14-32 7 7 13 18 14 32zM50 13c9 8 12 17 0 28-12-11-9-20 0-28z"/><path d="M45 29l11-11" stroke="${stroke}" stroke-width="4"/>`,
    knight: `<path ${common} d="M27 86h47l-6-12H33zM37 72c-2-12 1-23 11-31l-9-5 8-20c23 8 29 29 14 56z"/><path d="M53 29h1" stroke="${stroke}" stroke-width="6"/>`,
    pawn: `<path ${common} d="M31 86h38l-5-10H36zM39 73c1-12 5-20 11-24 6 4 10 12 11 24z"/><circle ${common} cx="50" cy="34" r="13"/>`,
  };
  return bodies[role];
}

function roleSignature(role: Role, accent: string, gold: string) {
  const marks: Record<Role, string> = {
    king: `<path d="M35 62h30" stroke="${accent}" stroke-width="5"/><circle cx="50" cy="49" r="4" fill="${gold}"/>`,
    queen: `<circle cx="39" cy="27" r="3" fill="${gold}"/><circle cx="50" cy="20" r="3" fill="${gold}"/><circle cx="61" cy="27" r="3" fill="${gold}"/>`,
    rook: `<path d="M38 51h24M39 61h22" stroke="${accent}" stroke-width="4"/>`,
    bishop: `<path d="M38 60q12-10 24 0" fill="none" stroke="${accent}" stroke-width="4"/>`,
    knight: `<path d="M42 49q13 2 20 13" fill="none" stroke="${accent}" stroke-width="4"/>`,
    pawn: `<path d="M40 67h20" stroke="${accent}" stroke-width="4"/>`,
  };
  return marks[role];
}

function themeStructure(theme: Theme, role: Role, fill: string, stroke: string, accent: string, gold: string) {
  const shared: Record<Theme, string> = {
    magic: `<path d="M18 72L29 47 36 70M82 72L71 47 64 70" fill="${fill}" stroke="${stroke}" stroke-width="4"/><path d="M22 30l4 7 8 2-8 3-4 8-3-8-8-3 8-2z" fill="${gold}"/><path d="M76 48l3 5 6 2-6 2-3 6-2-6-6-2 6-2z" fill="${accent}"/>`,
    fairytale: `<path d="M32 67C17 56 13 42 20 34c12 2 19 12 22 24M68 67c15-11 19-25 12-33-12 2-19 12-22 24" fill="${fill}" stroke="${accent}" stroke-width="4"/><path d="M50 50c-8-8-18 3 0 15 18-12 8-23 0-15z" fill="${gold}"/>`,
    "forest-anime": `<path d="M31 70C15 59 14 45 23 36c13 5 17 17 16 28M69 70c16-11 17-25 8-34-13 5-17 17-16 28" fill="${fill}" stroke="${accent}" stroke-width="4"/><path d="M21 64q16-9 25 4M79 64q-16-9-25 4" fill="none" stroke="${gold}" stroke-width="3"/>`,
    warcraft: `<path d="M34 48C20 44 14 33 16 19c13 3 22 12 27 25M66 48c14-4 20-15 18-29-13 3-22 12-27 25" fill="${fill}" stroke="${stroke}" stroke-width="5"/><path d="M25 72l9-17 8 18M75 72l-9-17-8 18" fill="${accent}" stroke="${stroke}" stroke-width="3"/>`,
    zombie: `<path d="M31 78l5-17 6 6 6-19 7 13 7-8 7 25" fill="none" stroke="${accent}" stroke-width="5"/><path d="M27 35l8 6-6 8 10 6M73 35l-8 6 6 8-10 6" fill="none" stroke="${gold}" stroke-width="3"/>`,
    robot: `<path d="M26 70V43h9l4-9h22l4 9h9v27" fill="none" stroke="${accent}" stroke-width="5"/><circle cx="43" cy="51" r="3" fill="${gold}"/><circle cx="57" cy="51" r="3" fill="${gold}"/><path d="M43 61h14M20 49h7M73 49h7" stroke="${accent}" stroke-width="4"/>`,
    myth: `<path d="M35 69C18 62 14 50 19 38c12 2 21 10 25 22M65 69c17-7 21-19 16-31-12 2-21 10-25 22" fill="${fill}" stroke="${gold}" stroke-width="4"/><path d="M54 20L42 45h10l-7 20 17-28H51z" fill="${accent}"/>`,
    egypt: `<path d="M28 70V34l12-15h20l12 15v36l-12-8V33H40v29z" fill="${gold}" stroke="${stroke}" stroke-width="3"/><path d="M32 42h8M60 42h8M32 51h8M60 51h8" stroke="${accent}" stroke-width="4"/>`,
    india: `<path d="M50 76C34 70 24 58 25 43c10 1 18 7 25 18 7-11 15-17 25-18 1 15-9 27-25 33z" fill="${accent}" stroke="${stroke}" stroke-width="3"/><path d="M50 76C40 61 41 45 50 33c9 12 10 28 0 43z" fill="${gold}" stroke="${stroke}" stroke-width="3"/>`,
    china: `<path d="M18 47h64L70 36H30zM26 47l-8 10h64L74 47" fill="${accent}" stroke="${stroke}" stroke-width="3"/><path d="M30 57v13M70 57v13" stroke="${gold}" stroke-width="5"/>`,
    japan: `<path d="M24 54c4-18 14-28 26-28s22 10 26 28l-13-7-13 10-13-10z" fill="${accent}" stroke="${stroke}" stroke-width="4"/><path d="M27 33C16 24 18 13 21 9c3 11 11 17 21 20M73 33C84 24 82 13 79 9c-3 11-11 17-21 20" fill="${gold}" stroke="${stroke}" stroke-width="3"/>`,
    europe: `<path d="M50 76L27 66l4-31 19-9 19 9 4 31z" fill="none" stroke="${accent}" stroke-width="5"/><path d="M50 30v42M31 49h38" stroke="${gold}" stroke-width="4"/><path d="M22 31l7-15 8 13M78 31l-7-15-8 13" fill="${fill}" stroke="${stroke}" stroke-width="3"/>`,
  };

  const roleTweaks: Record<Role, string> = {
    king: `<path d="M43 10h14M50 3v14" stroke="${gold}" stroke-width="4"/>`,
    queen: `<path d="M30 18l8-9 12 10L62 9l8 9" fill="none" stroke="${gold}" stroke-width="4"/>`,
    rook: `<path d="M25 25h10V14h12v11h12V14h12v11" fill="none" stroke="${accent}" stroke-width="5"/>`,
    bishop: `<path d="M50 10q-13 9-14 23M50 10q13 9 14 23" fill="none" stroke="${gold}" stroke-width="4"/>`,
    knight: `<path d="M38 18L27 8l3 22M52 18L48 5 62 17" fill="${accent}" stroke="${stroke}" stroke-width="3"/>`,
    pawn: `<path d="M35 38q15-15 30 0" fill="none" stroke="${gold}" stroke-width="4"/>`,
  };
  return shared[theme] + roleTweaks[role];
}

function makeSvg(theme: Theme, role: Role, side: Side) {
  const [accent, gold] = palettes[theme];
  const fill = side === "white" ? "#f8f2e5" : "#172233";
  const stroke = side === "white" ? "#172233" : "#f1eadb";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g>${baseRole(role, fill, stroke)}${themeStructure(theme, role, fill, stroke, accent, gold)}${roleSignature(role, accent, gold)}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function pieceThemeCss(theme: string) {
  if (Object.hasOwn(palettes, theme) && theme !== "fairytale") {
    const selectedTheme = theme as Theme;
    return roles.flatMap((role) => sides.map((side) =>
      `[data-piece-style="${selectedTheme}"] .cg-wrap piece.${side}.${role}{background-image:url("${makeSvg(selectedTheme, role, side)}")!important}`,
    )).join("\n");
  }
  const raster = rasterSets.find((set) => set.id === theme);
  if (!raster) return "";
  return roles.flatMap((role) => {
    const image = rasterImages[`./assets/pieces/${raster.folder}/${role}.webp`];
    if (!image) return [];
    return sides.map((side) =>
      `[data-piece-style="${raster.id}"] .cg-wrap piece.${side}.${role}{background-image:url("${image}")!important;filter:${side === "white" ? `${raster.whiteFilter} ` : ""}drop-shadow(0 2px 1px rgba(12,25,42,.32))!important}`,
    );
  }).join("\n");
}

let generatedStyle: HTMLStyleElement | null = null;

export function installPieceTheme(theme: string) {
  const css = pieceThemeCss(theme);
  if (!css) {
    generatedStyle?.remove();
    generatedStyle = null;
    return;
  }
  generatedStyle ??= document.createElement("style");
  generatedStyle.dataset.generatedPieceTheme = theme;
  generatedStyle.textContent = css;
  if (!generatedStyle.isConnected) document.head.append(generatedStyle);
}
