import React, { useState } from "react";
import { Lock, KeyRound, Sparkles, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { triggerHaptic } from "@/lib/haptics";

interface PasscodeLockScreenProps {
  spaceName?: string | null;
  error?: string | null;
  isVerifying: boolean;
  onUnlock: (passcode: string) => void;
}

export const PasscodeLockScreen: React.FC<PasscodeLockScreenProps> = ({
  spaceName,
  error,
  isVerifying,
  onUnlock,
}) => {
  const [pin, setPin] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim() || isVerifying) return;
    triggerHaptic(12);
    onUnlock(pin.trim());
  };

  return (
    <div
      data-testid="passcode-lock-screen"
      className="min-h-screen bg-background text-foreground flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/15 border border-primary/30 text-primary shadow-sm">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Unlock Household</h1>
          <p className="text-sm text-muted-foreground">
            {spaceName
              ? `Enter the household passcode for "${spaceName}"`
              : "Enter the household passcode to access this workspace."}
          </p>
        </div>

        <Card className="border-border/80 shadow-lg">
          <form onSubmit={handleSubmit}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-primary" />
                Household Passcode / PIN
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Saved locally on this device once unlocked so you never have to re-enter it.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                type="password"
                data-testid="unlock-passcode-input"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Enter passcode or PIN..."
                className="h-11 text-base tracking-widest text-center"
                autoFocus
              />

              {error && (
                <div
                  data-testid="unlock-passcode-error"
                  className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 p-2.5 rounded-lg"
                >
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                data-testid="unlock-submit-button"
                disabled={!pin.trim() || isVerifying}
                className="w-full h-10 gap-2"
              >
                {isVerifying ? (
                  <>
                    <Sparkles className="w-4 h-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    Unlock Workspace
                  </>
                )}
              </Button>
            </CardContent>
          </form>
        </Card>
      </div>
    </div>
  );
};
