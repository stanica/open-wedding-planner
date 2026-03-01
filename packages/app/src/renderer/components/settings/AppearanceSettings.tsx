import { Monitor, Moon, Sun } from "lucide-react";
import { useThemeStore } from "../../stores/theme-store";

const options = [
  { value: "system" as const, label: "System", icon: Monitor },
  { value: "light" as const, label: "Light", icon: Sun },
  { value: "dark" as const, label: "Dark", icon: Moon },
];

export function AppearanceSettings() {
  const { preference, setPreference } = useThemeStore();

  return (
    <div>
      <h2 className="text-lg font-semibold text-on-surface">Appearance</h2>
      <p className="mt-1 text-sm text-on-surface-tertiary">
        Choose your preferred color theme
      </p>
      <div className="mt-3 inline-flex rounded-lg border border-border bg-surface-elevated p-1 gap-1">
        {options.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setPreference(value)}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              preference === value
                ? "bg-surface-active text-on-surface"
                : "text-on-surface-tertiary hover:text-on-surface-secondary"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
