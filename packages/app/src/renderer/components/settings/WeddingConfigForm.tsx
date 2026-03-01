import { useState, useEffect } from "react";
import { useRequest, useMutation } from "../../hooks/useRequest";

interface WeddingConfig {
  weddingDate: string | null;
  guestCount: number | null;
  totalBudget: number | null;
  currency: string;
  coupleNames: string | null;
  email: string | null;
  location: string | null;
  dietaryRequirements: string | null;
  alcoholPreferences: string | null;
  languagePreferences: string[];
}

export function WeddingConfigForm() {
  const { data, loading } = useRequest<WeddingConfig>("wedding-config.get");
  const { mutate: updateConfig, loading: saving } = useMutation<
    Partial<WeddingConfig>,
    WeddingConfig
  >("wedding-config.update");

  const [form, setForm] = useState<WeddingConfig>({
    weddingDate: null,
    guestCount: null,
    totalBudget: null,
    currency: "EUR",
    coupleNames: null,
    email: null,
    location: null,
    dietaryRequirements: null,
    alcoholPreferences: null,
    languagePreferences: ["en", "it"],
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await updateConfig(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function update<K extends keyof WeddingConfig>(key: K, value: WeddingConfig[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  if (loading) {
    return <div className="animate-pulse text-on-surface-tertiary">Loading settings...</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <h2 className="text-lg font-semibold">Wedding Details</h2>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Couple Names">
          <input
            type="text"
            value={form.coupleNames ?? ""}
            onChange={(e) => update("coupleNames", e.target.value || null)}
            placeholder="e.g. Alex & Jordan"
          />
        </Field>

        <Field label="Wedding Date">
          <input
            type="date"
            value={form.weddingDate ?? ""}
            onChange={(e) => update("weddingDate", e.target.value || null)}
          />
        </Field>

        <Field label="Guest Count">
          <input
            type="number"
            value={form.guestCount ?? ""}
            onChange={(e) =>
              update("guestCount", e.target.value ? parseInt(e.target.value, 10) : null)
            }
            placeholder="60"
          />
        </Field>

        <Field label="Total Budget">
          <input
            type="number"
            value={form.totalBudget ?? ""}
            onChange={(e) =>
              update("totalBudget", e.target.value ? parseFloat(e.target.value) : null)
            }
            placeholder="50000"
          />
        </Field>

        <Field label="Currency">
          <select
            value={form.currency}
            onChange={(e) => update("currency", e.target.value)}
          >
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
            <option value="GBP">GBP</option>
            <option value="CAD">CAD</option>
          </select>
        </Field>

        <Field label="Location">
          <input
            type="text"
            value={form.location ?? ""}
            onChange={(e) => update("location", e.target.value || null)}
            placeholder="Ischia, Italy"
          />
        </Field>

        <Field label="Email">
          <input
            type="email"
            value={form.email ?? ""}
            onChange={(e) => update("email", e.target.value || null)}
            placeholder="couple@email.com"
          />
        </Field>

        <Field label="Languages">
          <input
            type="text"
            value={form.languagePreferences.join(", ")}
            onChange={(e) =>
              update(
                "languagePreferences",
                e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
              )
            }
            placeholder="en, it"
          />
        </Field>
      </div>

      <Field label="Dietary Requirements">
        <textarea
          rows={2}
          value={form.dietaryRequirements ?? ""}
          onChange={(e) => update("dietaryRequirements", e.target.value || null)}
          placeholder="Any dietary needs for guests..."
        />
      </Field>

      <Field label="Alcohol Preferences">
        <textarea
          rows={2}
          value={form.alcoholPreferences ?? ""}
          onChange={(e) => update("alcoholPreferences", e.target.value || null)}
          placeholder="Wine, cocktails, open bar..."
        />
      </Field>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-950 hover:bg-gray-200 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
        {saved && (
          <span className="text-sm text-success">Settings saved</span>
        )}
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-on-surface-secondary">{label}</span>
      <div className="[&>input]:w-full [&>input]:rounded-lg [&>input]:border [&>input]:border-border [&>input]:bg-surface-elevated [&>input]:px-3 [&>input]:py-2 [&>input]:text-sm [&>input]:text-on-surface [&>input]:outline-none [&>input]:focus:border-border-hover [&>select]:w-full [&>select]:rounded-lg [&>select]:border [&>select]:border-border [&>select]:bg-surface-elevated [&>select]:px-3 [&>select]:py-2 [&>select]:text-sm [&>select]:text-on-surface [&>select]:outline-none [&>textarea]:w-full [&>textarea]:rounded-lg [&>textarea]:border [&>textarea]:border-border [&>textarea]:bg-surface-elevated [&>textarea]:px-3 [&>textarea]:py-2 [&>textarea]:text-sm [&>textarea]:text-on-surface [&>textarea]:outline-none [&>textarea]:resize-none">
        {children}
      </div>
    </label>
  );
}
