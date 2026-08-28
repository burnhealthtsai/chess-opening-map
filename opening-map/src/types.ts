export type RelationMode = "family" | "style";

export type TranspositionRoute = {
  label: string;
  line: string;
  openingId: string;
};

export type TranspositionGroup = {
  id: string;
  title: string;
  summary: string;
  relation: "exact";
  targetFen: string;
  memberIds: string[];
  routes: TranspositionRoute[];
  source: "curated" | "lichess-epd";
};

export type AnalogyGroup = {
  id: string;
  title: string;
  summary: string;
  relation: "reversed" | "structure" | "plan";
  blackIds: string[];
  whiteIds: string[];
  sharedIdeas: string[];
  difference: string;
  examples: {
    black: { openingId: string; label: string; line: string };
    white: { openingId: string; label: string; line: string };
  };
};

export type Opening = {
  id: string;
  title_zh: string;
  title_en: string;
  side: "白方" | "黑方";
  category: "主流" | "趣味";
  eco: string;
  first_move: string;
  first_move_san: string;
  reply_san: string;
  styles: string[];
  mainline: string;
  variations: { name: string; line: string }[];
  subgroup: { id: string; label: string };
  family: { id: string; label: string };
};

export type OpeningDetails = {
  difficulty: string;
  ideas: string;
  plans: string[];
  mistakes: string[];
};

export type DetailedOpening = Opening & OpeningDetails;

export type OpeningDetailsData = {
  schema_version: number;
  catalog_revision: string;
  edges: Record<RelationMode, Edge[]>;
  openings: Record<string, OpeningDetails>;
};

export type OpeningExplorerData = {
  schema_version: number;
  catalog_revision: string;
  transpositionGroups: TranspositionGroup[];
  analogyGroups: AnalogyGroup[];
};

export type OpeningVariationNotesData = {
  schema_version: number;
  catalog_revision: string;
  notes: string[][];
};

export type Edge = { source: string; target: string; weight: number };
export type FamilySummary = {
  id: string;
  label: string;
  side: Opening["side"];
  first_move: string;
  first_move_san: string;
  reply_san: string;
  subgroup: { id: string; label: string };
  count: number;
  eco_min: string;
  eco_max: string;
  representative_ids: string[];
};
export type OpeningMapData = {
  schema_version: number;
  catalog_revision: string;
  nodes: Opening[];
  navigation: {
    sides: { id: Opening["side"]; count: number }[];
    first_moves: { side: Opening["side"]; value: string; count: number }[];
    families: FamilySummary[];
    styles: { value: string; count: number }[];
  };
};
