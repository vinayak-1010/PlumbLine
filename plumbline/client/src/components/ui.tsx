import type { Status, Severity } from "../types";

const S: Record<Status, [string, string]> = {
  draft: ["Draft", "bg-mist text-ink"], in_review: ["In human review", "bg-amber-light text-[#8A5A0B]"],
  changes_requested: ["Changes requested", "bg-rose-light text-rose"], approved: ["Approved, awaiting sign-off", "bg-teal-light text-teal"],
  ready_to_publish: ["Ready to publish", "bg-moss text-white"],
};
export function StatusPill({ s }: { s: Status }) {
  const [t, c] = S[s];
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${c}`}>{t}</span>;
}
export const sevStyle: Record<Severity, { chip: string; mark: string; border: string; label: string }> = {
  high: { chip: "bg-rose text-white", mark: "bg-rose-light border-rose", border: "border-rose", label: "High" },
  medium: { chip: "bg-amber text-ink", mark: "bg-amber-light border-amber", border: "border-amber", label: "Medium" },
  low: { chip: "bg-teal text-white", mark: "bg-teal-light border-teal", border: "border-teal", label: "Low" },
};
export const typeLabel: Record<string, string> = {
  terminology: "Terminology", claim_unsupported: "Unsupported claim", claim_overstated: "Overstated claim", claim_expired: "Expired fact",
  brand_name: "Brand name", tone: "Tone", clarity: "Clarity", disclosure: "Missing disclosure", confidential: "Confidential data", ai_tone: "Tone (AI judge)",
};
export const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export function Empty({ children }: { children: React.ReactNode }) { return <div className="rounded-xl border border-dashed border-ink/25 p-8 text-center text-ink/60">{children}</div>; }
