import React, { useState } from "react";
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Plus,
  Trash2,
  Check,
  Home,
  Users,
  Lock,
} from "lucide-react";
import type { SetupMemberInput, SetupPayload } from "@todo-app/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { triggerHaptic } from "@/lib/haptics";

const AVATAR_PRESETS = ["🧑‍💻", "🌿", "🦊", "☕", "🐱", "🐶", "🐼", "✨", "🎨", "🚀", "🎧", "🌻"];

interface SetupWizardProps {
  onSubmit: (payload: SetupPayload, selectedMemberIndex: number) => void;
  isSubmitting: boolean;
  error?: string | null;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({
  onSubmit,
  isSubmitting,
  error,
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [spaceName, setSpaceName] = useState("Our Home");
  const [passcode, setPasscode] = useState("");
  const [members, setMembers] = useState<SetupMemberInput[]>([
    { name: "", avatar: "🧑‍💻", role: "owner" },
    { name: "", avatar: "🌿", role: "member" },
  ]);
  const [activeDeviceIndex, setActiveDeviceIndex] = useState<number>(0);

  const handleMemberChange = (index: number, patch: Partial<SetupMemberInput>) => {
    setMembers((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  };

  const handleAddMember = () => {
    triggerHaptic(10);
    const nextAvatar = AVATAR_PRESETS[members.length % AVATAR_PRESETS.length];
    setMembers((prev) => [...prev, { name: "", avatar: nextAvatar, role: "member" }]);
  };

  const handleRemoveMember = (index: number) => {
    if (members.length <= 1) return;
    triggerHaptic(10);
    setMembers((prev) => prev.filter((_, i) => i !== index));
    if (activeDeviceIndex >= index && activeDeviceIndex > 0) {
      setActiveDeviceIndex((v) => v - 1);
    }
  };

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (!spaceName.trim()) return;
    triggerHaptic(12);
    setStep(2);
  };

  const handleComplete = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedMembers = members
      .map((m, idx) => ({
        name: m.name.trim(),
        avatar: m.avatar.trim() || "👤",
        role: idx === 0 ? ("owner" as const) : ("member" as const),
      }))
      .filter((m) => m.name.length > 0);

    if (!spaceName.trim() || cleanedMembers.length === 0) return;

    triggerHaptic([15, 25, 15]);
    const boundedIndex = Math.min(activeDeviceIndex, cleanedMembers.length - 1);
    onSubmit(
      {
        spaceName: spaceName.trim(),
        passcode: passcode.trim() || null,
        members: cleanedMembers,
      },
      boundedIndex
    );
  };

  const validMemberCount = members.filter((m) => m.name.trim().length > 0).length;

  return (
    <div
      data-testid="setup-wizard"
      className="min-h-screen bg-background text-foreground flex items-center justify-center p-4"
    >
      <div className="w-full max-w-lg space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/15 border border-primary/30 text-primary text-xl font-bold shadow-sm">
            ✓
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome to Noted</h1>
          <p className="text-sm text-muted-foreground">
            30-second setup • Zero overhead • Guilt-free rollover
          </p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2">
          <Badge
            variant={step === 1 ? "default" : "secondary"}
            className="gap-1.5 px-3 py-1 text-xs"
          >
            <Home className="w-3.5 h-3.5" />
            1. Space & Security
          </Badge>
          <div className="w-6 h-px bg-border" />
          <Badge
            variant={step === 2 ? "default" : "secondary"}
            className="gap-1.5 px-3 py-1 text-xs"
          >
            <Users className="w-3.5 h-3.5" />
            2. Members & Identity
          </Badge>
        </div>

        <Card className="border-border/80 shadow-lg">
          {step === 1 ? (
            <form onSubmit={handleNextStep}>
              <CardHeader>
                <CardTitle className="text-lg">Step 1: Name & Protect Your Space</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Configure your household name and an optional shared passcode to prevent unauthorized access.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Workspace / Household Name
                  </label>
                  <Input
                    data-testid="setup-space-name-input"
                    value={spaceName}
                    onChange={(e) => setSpaceName(e.target.value)}
                    placeholder="e.g. Our Home, Maple Apt 4B, Personal Hub"
                    className="h-11 text-base"
                    autoFocus
                  />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {["Our Home", "Household Hub", "My Focus Space", "The Loft"].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setSpaceName(preset)}
                        className="text-xs px-2.5 py-1 rounded-full bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Optional Household Passcode */}
                <div className="space-y-2 pt-2 border-t border-border/50">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-primary" />
                    Household Passcode (Optional)
                  </label>
                  <Input
                    type="password"
                    data-testid="setup-passcode-input"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="Leave blank for open access, or set a shared PIN/passcode"
                    className="h-10 text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    When set, new devices or browsers must enter this passcode once to unlock the board.
                  </p>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button
                    type="submit"
                    data-testid="setup-next-button"
                    disabled={!spaceName.trim()}
                    className="gap-1.5"
                  >
                    Next: Add Members
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </form>
          ) : (
            <form onSubmit={handleComplete}>
              <CardHeader>
                <CardTitle className="text-lg">Step 2: Household Members</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Add 1 member for Solo Mode, or 2–4 members for side-by-side collaborative visibility.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {members.map((member, idx) => (
                    <div
                      key={idx}
                      data-testid={`setup-member-row-${idx}`}
                      className="p-3 rounded-xl border border-border/70 bg-secondary/20 space-y-2.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xl w-9 h-9 rounded-lg bg-background border border-border flex items-center justify-center shrink-0">
                          {member.avatar}
                        </span>
                        <Input
                          data-testid={`setup-member-name-${idx}`}
                          value={member.name}
                          onChange={(e) => handleMemberChange(idx, { name: e.target.value })}
                          placeholder={
                            idx === 0
                              ? "Your name (e.g. Alex)"
                              : `Member ${idx + 1} name (e.g. Sam / Partner)`
                          }
                          className="h-9 flex-1 bg-background"
                          autoFocus={idx === 0}
                        />
                        <button
                          type="button"
                          onClick={() => setActiveDeviceIndex(idx)}
                          data-testid={`setup-this-device-${idx}`}
                          className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors shrink-0 ${
                            activeDeviceIndex === idx
                              ? "bg-primary/15 text-primary border-primary/40"
                              : "bg-background text-muted-foreground border-border hover:text-foreground"
                          }`}
                          title="Remember this member as the default identity on this device"
                        >
                          {activeDeviceIndex === idx ? "✓ This Device" : "Use on Device"}
                        </button>
                        {members.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(idx)}
                            className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                            title="Remove member"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* Quick Emoji Picker */}
                      <div className="flex flex-wrap items-center gap-1 pl-1">
                        <span className="text-[11px] text-muted-foreground mr-1">Avatar:</span>
                        {AVATAR_PRESETS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => handleMemberChange(idx, { avatar: emoji })}
                            className={`w-6 h-6 rounded text-xs flex items-center justify-center transition-transform ${
                              member.avatar === emoji
                                ? "bg-primary/25 ring-1 ring-primary scale-110"
                                : "hover:bg-secondary"
                            }`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {members.length < 6 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddMember}
                    data-testid="setup-add-member"
                    className="w-full gap-1.5 text-xs border-dashed"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Another Member
                  </Button>
                )}

                {error && (
                  <p className="text-xs text-destructive bg-destructive/10 p-2 rounded-md">
                    {error}
                  </p>
                )}

                <div className="pt-2 flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setStep(1)}
                    className="gap-1.5"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </Button>

                  <Button
                    type="submit"
                    data-testid="setup-submit-button"
                    disabled={validMemberCount === 0 || isSubmitting}
                    className="gap-1.5"
                  >
                    {isSubmitting ? (
                      <>
                        <Sparkles className="w-4 h-4 animate-spin" />
                        Launching Hub...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Launch {spaceName.trim() || "Hub"}
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
};
