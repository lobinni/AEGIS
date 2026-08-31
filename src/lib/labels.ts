/** Display labels shared by dispute cards and detail views. */

export const CATEGORY_LABEL: Record<string, string> = {
  freelance: "Freelance",
  dao_governance: "DAO Gov",
  marketplace: "Marketplace",
};

export const STATUS_LABEL: Record<string, string> = {
  open: "open",
  under_review: "in review",
  resolved: "resolved",
};

export const VERDICT_VIEW: Record<string, { label: string; tone: "cyan" | "violet" | "amber" | "rose" }> = {
  CLAIMANT_WINS: { label: "Claimant wins", tone: "cyan" },
  RESPONDENT_WINS: { label: "Respondent wins", tone: "violet" },
  SPLIT_DECISION: { label: "Split decision", tone: "amber" },
  DISMISSED: { label: "Dismissed", tone: "rose" },
};
