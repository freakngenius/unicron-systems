// VoiceTab — third sub-tab inside Atrium Products (right of Metacron).
//
// Hosts the three Voice sub-sub-tabs (Agents / Campaigns / Activity) via
// component-local state — no URL routing. Wraps everything in <div className="atrium-v3">
// so the voice-v3.css scope applies.

import { useState } from "react";
import { V3PageBody, V3PageTitle, V3VoiceTabs } from "./components/v3primitives";
import type { VoiceSubSection } from "./components/v3primitives";
import { VoiceAgentsView } from "./VoiceAgentsView";
import { VoiceCampaignsView } from "./VoiceCampaignsView";
import { VoiceActivityView } from "./VoiceActivityView";

export function VoiceTab() {
  const [sub, setSub] = useState<VoiceSubSection>("agents");

  return (
    <div className="atrium-v3" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <V3PageBody>
        <V3PageTitle
          eyebrow="Products · Voice Agents"
          title="Voice"
        />
        <div style={{ padding: "0 28px 28px", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <V3VoiceTabs active={sub} onChange={setSub} />
          {sub === "agents"    && <VoiceAgentsView />}
          {sub === "campaigns" && <VoiceCampaignsView />}
          {sub === "activity"  && <VoiceActivityView />}
        </div>
      </V3PageBody>
    </div>
  );
}
