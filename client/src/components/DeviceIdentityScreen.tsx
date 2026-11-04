import React from "react";
import { UserCheck, ArrowRight } from "lucide-react";
import type { Member } from "@todo-app/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { triggerHaptic } from "@/lib/haptics";

interface DeviceIdentityScreenProps {
  spaceName: string;
  members: Member[];
  onSelectMember: (memberId: string) => void;
}

export const DeviceIdentityScreen: React.FC<DeviceIdentityScreenProps> = ({
  spaceName,
  members,
  onSelectMember,
}) => {
  return (
    <div
      data-testid="device-identity-screen"
      className="min-h-screen bg-background text-foreground flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/15 border border-primary/30 text-primary shadow-sm">
            <UserCheck className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Who is using this device?
          </h1>
          <p className="text-sm text-muted-foreground">
            Choose whose profile this device uses in <span className="text-foreground font-medium">{spaceName}</span>.
            Household members can switch profiles at any time.
          </p>
        </div>

        <Card className="border-border/80 shadow-lg">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground font-medium">
              Select a device profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {members.map((member) => (
              <button
                key={member.id}
                type="button"
                data-testid={`select-device-member-${member.name.toLowerCase()}`}
                onClick={() => {
                  triggerHaptic([15, 25]);
                  onSelectMember(member.id);
                }}
                className="w-full flex items-center justify-between p-3.5 rounded-xl border border-border/70 bg-secondary/20 hover:bg-primary/10 hover:border-primary/40 transition-all group text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl w-11 h-11 rounded-xl bg-background border border-border flex items-center justify-center shadow-sm">
                    {member.avatar}
                  </span>
                  <div>
                    <div className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                      {member.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Set as &ldquo;My Focus&rdquo; on this device
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
