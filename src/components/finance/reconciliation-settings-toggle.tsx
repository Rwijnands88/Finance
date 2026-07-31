"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ReconciliationSettingsToggleProps = {
  initialEnabled: boolean;
};

export function ReconciliationSettingsToggle({
  initialEnabled,
}: ReconciliationSettingsToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function updateReconciliationSetting(nextEnabled: boolean) {
    setEnabled(nextEnabled);
    setIsSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/user-settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reconciliationEnabled: nextEnabled }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "Maandaansluiting-instelling opslaan lukte niet.",
        );
      }

      setEnabled(Boolean(result.settings?.reconciliationEnabled));
      setMessage("Opgeslagen.");
    } catch (error) {
      setEnabled(!nextEnabled);
      setMessage(
        error instanceof Error
          ? error.message
          : "Maandaansluiting-instelling opslaan lukte niet.",
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
            Maandaansluiting inschakelen
          </p>
          <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">
            Toon het aansluitingsblok in het gezamenlijke maandoverzicht.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={isSaving}
          onClick={() => updateReconciliationSetting(!enabled)}
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
          <span className="sr-only">Maandaansluiting inschakelen</span>
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
          {message ||
            (enabled
              ? "Maandaansluiting staat aan."
              : "Maandaansluiting staat uit.")}
        </p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={isSaving}
          onClick={() => updateReconciliationSetting(!enabled)}
        >
          {isSaving ? "Opslaan..." : enabled ? "Uitzetten" : "Aanzetten"}
        </Button>
      </div>
    </div>
  );
}
