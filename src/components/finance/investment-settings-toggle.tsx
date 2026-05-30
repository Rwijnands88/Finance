"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type InvestmentSettingsToggleProps = {
  initialEnabled: boolean;
};

export function InvestmentSettingsToggle({
  initialEnabled,
}: InvestmentSettingsToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function updateInvestmentSetting(nextEnabled: boolean) {
    setEnabled(nextEnabled);
    setIsSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/investment-settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ investingEnabled: nextEnabled }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "Investeren-instelling opslaan lukte niet.",
        );
      }

      setEnabled(Boolean(result.settings?.investingEnabled));
      setMessage("Opgeslagen.");
    } catch (error) {
      setEnabled(!nextEnabled);
      setMessage(
        error instanceof Error
          ? error.message
          : "Investeren-instelling opslaan lukte niet.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid gap-4 rounded-[16px] border border-[var(--border)] bg-black/10 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            Investeren inschakelen
          </p>
          <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">
            Toon de Investeren-sectie in Mijn rekening.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={isSaving}
          onClick={() => updateInvestmentSetting(!enabled)}
          className={cn(
            "relative h-8 w-14 shrink-0 rounded-full border transition disabled:opacity-60",
            enabled
              ? "border-indigo-400/60 bg-indigo-500"
              : "border-[var(--border-strong)] bg-[#27272A]",
          )}
        >
          <span
            className={cn(
              "absolute top-1 h-6 w-6 rounded-full bg-white shadow transition",
              enabled ? "left-7" : "left-1",
            )}
          />
          <span className="sr-only">Investeren inschakelen</span>
        </button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p
          className={cn(
            "text-xs",
            message === "Opgeslagen."
              ? "text-emerald-400"
              : "text-[var(--text-secondary)]",
          )}
        >
          {message || (enabled ? "Investeren staat aan." : "Investeren staat uit.")}
        </p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={isSaving}
          onClick={() => updateInvestmentSetting(!enabled)}
        >
          {isSaving ? "Opslaan..." : enabled ? "Uitzetten" : "Aanzetten"}
        </Button>
      </div>
    </div>
  );
}
