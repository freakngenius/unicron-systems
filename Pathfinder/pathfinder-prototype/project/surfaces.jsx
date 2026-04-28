// surfaces.jsx — branch-focus, project-detail, cross-pollination wireframes.
// All built around the Linear-ish base shell so users can compare moments
// (focus, detail, cross-poll) without the chrome confusing the comparison.

const SURF_W = 1280, SURF_H = 800;

function SurfShell({ children }) {
  return (
    <div style={{
      width: SURF_W * 0.7, height: SURF_H * 0.7,
      overflow: 'hidden', background: WF.paper, position: 'relative',
    }}>
      <div style={{
        width: SURF_W, height: SURF_H,
        transform: 'scale(0.7)', transformOrigin: 'top left',
        position: 'relative',
      }}>{children}</div>
    </div>
  );
}

// Reusable base chrome: top bar + left rail + map area
function BaseChrome({ children, selectedIdx = 1, mapChildren, rightRail, showCustomers }) {
  return (
    <>
      <div style={{ height: 48, borderBottom: `1px solid ${WF.ruleSoft}`, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 24 }}>
        <Hand size={18}>Pathfinder</Hand>
        <Label>field intel · v0.1</Label>
        <div style={{ flex: 1 }} />
        <Pill active>all sources</Pill>
        <Pill>USA</Pill><Pill>SAM</Pill><Pill>News</Pill><Pill>HC</Pill>
        <span style={{ width: 16 }} />
        <Pill accent={showCustomers}>{showCustomers ? '● cross-pollination' : 'show customers'}</Pill>
        <div style={{ flex: 1 }} />
        <Counter value="247" label="new · 24h" />
      </div>
      <div style={{ display: 'flex', height: 'calc(100% - 48px)' }}>
        <div style={{ width: 240, borderRight: `1px solid ${WF.ruleSoft}`, padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Label>branches · 5</Label>
          {['Phoenix','Houston','Atlanta','Chicago','Seattle'].map((n, i) => (
            <div key={n} style={{
              padding: '8px 10px',
              border: `1px solid ${i === selectedIdx ? WF.ink : WF.ruleSoft}`,
              background: i === selectedIdx ? WF.fill : 'transparent',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Body size={11.5} weight={500}>{n}</Body>
                <span style={{ font: `500 10px ${WF.mono}` }}>{[12,28,9,15,7][i]}</span>
              </div>
              <Label size={8.5}>{['phx','hou','atl','chi','sea'][i]}-00{i+1}</Label>
            </div>
          ))}
        </div>
        <div style={{ flex: 1, position: 'relative' }}>{mapChildren}</div>
        {rightRail}
      </div>
      {children}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// BRANCH-FOCUS — 4 directions for what happens when you click a branch
// ─────────────────────────────────────────────────────────────

// A. Camera pans, soft radius, list slides in
function BranchFocusA({ showAnnotations }) {
  return (
    <SurfShell>
      <BaseChrome
        mapChildren={
          <MapStub width={SURF_W - 240 - 360} height={SURF_H - 48}
                   showRadius radiusAt={[300, 280]} radiusSize={300}>
            <Pin x={300} y={280} kind="branch" label="HOU-002" />
            {[[260,240],[340,260],[320,310],[270,310],[230,290],[360,300],[290,200]].map((p, i) =>
              <Pin key={i} x={p[0]} y={p[1]} kind={i < 2 ? 'project-hi' : 'project'} />
            )}
            {/* dimmed other branches */}
            <div style={{ position: 'absolute', left: 100, top: 150, opacity: 0.3 }}>
              <Pin x={0} y={0} kind="branch" label="PHX" />
            </div>
          </MapStub>
        }
        rightRail={
          <div style={{ width: 360, borderLeft: `1px solid ${WF.ruleSoft}`, padding: '20px 16px' }}>
            <Hand size={16}>Houston · top 15</Hand>
            <Label style={{ marginTop: 4 }}>radius 300mi · 28 in range</Label>
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                ['TxDOT corridor expansion',94,true],
                ['Harris Co. detention',91,true],
                ['Federal courthouse RFP',87],
                ['METRO bus depot',83],
                ['Port of Houston news',76],
                ['Energy corridor study',71],
              ].map((p, i) => (
                <div key={i} style={{ padding: '8px 0', borderBottom: `1px solid ${WF.ruleHair}` }}>
                  <Body size={11.5} weight={500}>{p[0]}</Body>
                  <ScoreBar value={p[1]} accent={p[2]} />
                </div>
              ))}
            </div>
          </div>
        }
      />
      {showAnnotations && (
        <>
          <Note style={{ position: 'absolute', top: 280, left: 360, transform: 'rotate(-2deg)' }}>
            ⊙ coverage circle<br/>+ camera eases in
          </Note>
          <Note style={{ position: 'absolute', top: 100, left: 320, transform: 'rotate(2deg)' }}>
            other branches dim<br/>(but stay visible)
          </Note>
        </>
      )}
    </SurfShell>
  );
}

// B. Branch detail header replaces top of right rail
function BranchFocusB({ showAnnotations }) {
  return (
    <SurfShell>
      <BaseChrome
        mapChildren={
          <MapStub width={SURF_W - 240 - 380} height={SURF_H - 48}
                   showRadius radiusAt={[300, 280]} radiusSize={280}>
            <Pin x={300} y={280} kind="branch" label="HOU" />
            {[[260,240],[340,260],[320,310],[270,310],[230,290],[360,300]].map((p, i) =>
              <Pin key={i} x={p[0]} y={p[1]} kind={i < 2 ? 'project-hi' : 'project'} />
            )}
          </MapStub>
        }
        rightRail={
          <div style={{ width: 380, borderLeft: `1px solid ${WF.ruleSoft}`, display: 'flex', flexDirection: 'column' }}>
            {/* branch header card */}
            <div style={{ padding: 20, borderBottom: `1px solid ${WF.rule}`, background: WF.fill }}>
              <Label>HOU-002 · TX · opened 2019-04</Label>
              <Hand size={22} style={{ marginTop: 6 }}>Houston</Hand>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 14 }}>
                <Counter value="28" label="in range" />
                <Counter value="4" label="hi-pri" />
                <Counter value="6" label="customers" />
              </div>
              <div style={{ marginTop: 14, padding: '8px 10px', border: `1px dashed ${WF.accent}`, background: WF.accentSoft }}>
                <Label accent>● 2 warm-intro candidates</Label>
                <Body size={10.5} style={{ color: WF.inkDim, marginTop: 3 }}>
                  Harris Co. customer (Memorial Hermann) is 12mi from new RFP
                </Body>
              </div>
            </div>
            <div style={{ padding: '14px 16px', flex: 1 }}>
              <Label>top projects · sort: score</Label>
              {[['TxDOT corridor expansion',94,true],['Harris Co. detention',91,true],['Federal courthouse',87],['METRO bus depot',83]].map((p, i) => (
                <div key={i} style={{ padding: '10px 0', borderBottom: `1px solid ${WF.ruleHair}` }}>
                  <Body size={11.5} weight={500}>{p[0]}</Body>
                  <ScoreBar value={p[1]} accent={p[2]} />
                </div>
              ))}
            </div>
          </div>
        }
      />
      {showAnnotations && (
        <Note style={{ position: 'absolute', top: 70, right: 200, transform: 'rotate(2deg)' }}>
          ↑ branch detail card<br/>top of rail
        </Note>
      )}
    </SurfShell>
  );
}

// C. Branch info as overlay panel ON the map (anchored to the branch pin)
function BranchFocusC({ showAnnotations }) {
  return (
    <SurfShell>
      <BaseChrome
        mapChildren={
          <div style={{ position: 'relative', height: '100%' }}>
            <MapStub width={SURF_W - 240 - 360} height={SURF_H - 48}
                     showRadius radiusAt={[280, 300]} radiusSize={260}>
              <Pin x={280} y={300} kind="branch" label="HOU" />
              {[[240,260],[320,280],[300,330],[250,330],[210,310],[340,320]].map((p, i) =>
                <Pin key={i} x={p[0]} y={p[1]} kind={i < 2 ? 'project-hi' : 'project'} />
              )}
            </MapStub>
            {/* anchored card */}
            <div style={{
              position: 'absolute', left: 320, top: 280, width: 230,
              background: WF.paper, border: `1px solid ${WF.ink}`,
              padding: 12, boxShadow: '4px 4px 0 rgba(29,27,24,0.08)',
            }}>
              <Label>HOU-002 · selected</Label>
              <Hand size={18} style={{ marginTop: 4 }}>Houston</Hand>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 10 }}>
                <Counter value="28" label="in range" />
                <Counter value="4" label="hi-pri" />
                <Counter value="6" label="cust." />
              </div>
              <Label size={8.5} style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${WF.ruleSoft}` }}>
                opened 2019-04 · 300mi radius
              </Label>
            </div>
          </div>
        }
        rightRail={
          <div style={{ width: 360, borderLeft: `1px solid ${WF.ruleSoft}`, padding: '20px 16px' }}>
            <Hand size={16}>Top 15 in HOU coverage</Hand>
            {[['TxDOT corridor expansion',94,true],['Harris Co. detention',91,true],['Federal courthouse',87],['METRO bus depot',83],['Port of Houston',76]].map((p, i) => (
              <div key={i} style={{ padding: '10px 0', borderBottom: `1px solid ${WF.ruleHair}` }}>
                <Body size={11.5} weight={500}>{p[0]}</Body>
                <ScoreBar value={p[1]} accent={p[2]} />
              </div>
            ))}
          </div>
        }
      />
      {showAnnotations && (
        <Note style={{ position: 'absolute', top: 240, left: 600, transform: 'rotate(-3deg)' }}>
          anchored card<br/>= less context-switch
        </Note>
      )}
    </SurfShell>
  );
}

// D. Aggressive zoom — branch fills the map, surrounding context fades
function BranchFocusD({ showAnnotations }) {
  return (
    <SurfShell>
      <BaseChrome
        mapChildren={
          <div style={{ position: 'relative', height: '100%' }}>
            <MapStub width={SURF_W - 240 - 360} height={SURF_H - 48} showGrid={false}>
              {/* large radius dominating */}
              <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 480, height: 480, borderRadius: '50%', border: `2px dashed ${WF.accent}`, background: WF.accentSoft }} />
              <Pin x={(SURF_W - 240 - 360)/2} y={(SURF_H - 48)/2} kind="branch" label="HOU-002" />
              {[[300,280],[420,260],[400,340],[330,360],[260,310],[450,310],[360,220]].map((p, i) =>
                <Pin key={i} x={p[0]} y={p[1]} kind={i < 2 ? 'project-hi' : 'project'} size={i < 2 ? 14 : 10} />
              )}
            </MapStub>
            <div style={{ position: 'absolute', top: 16, left: 16, font: `500 10px ${WF.mono}`, color: WF.inkDim }}>
              ZOOM 7 · 29.76°N -95.36°W · 300mi
            </div>
            <div style={{ position: 'absolute', bottom: 16, left: 16, padding: '8px 12px', background: WF.paper, border: `1px solid ${WF.ruleSoft}` }}>
              <Label>← back to all branches</Label>
            </div>
          </div>
        }
        rightRail={
          <div style={{ width: 360, borderLeft: `1px solid ${WF.ruleSoft}`, padding: '20px 16px' }}>
            <Hand size={16}>Houston · zoomed in</Hand>
            <Label>radius dominates · pins enlarged</Label>
            {[['TxDOT corridor expansion',94,true],['Harris Co. detention',91,true],['Federal courthouse',87],['METRO bus depot',83]].map((p, i) => (
              <div key={i} style={{ padding: '10px 0', borderBottom: `1px solid ${WF.ruleHair}` }}>
                <Body size={11.5} weight={500}>{p[0]}</Body>
                <ScoreBar value={p[1]} accent={p[2]} />
              </div>
            ))}
          </div>
        }
      />
      {showAnnotations && (
        <Note style={{ position: 'absolute', top: 300, left: 380, transform: 'rotate(-2deg)' }}>
          ↑ aggressive zoom<br/>radius = whole canvas
        </Note>
      )}
    </SurfShell>
  );
}

// ─────────────────────────────────────────────────────────────
// PROJECT-DETAIL — 3 alternatives: modal / drawer / inline
// ─────────────────────────────────────────────────────────────

const projectFixture = {
  title: 'TxDOT I-45 corridor security expansion',
  source: 'sam.gov',
  sourceId: 'SOL-2026-04-TxDOT-001',
  posted: '2026-04-22',
  value: '$4.2M',
  stage: 'RFP — open',
  distance: '12.4 mi · within HOU-002 coverage',
  score: 94,
  rationale: 'High match. Project type (perimeter security, vehicle barriers, surveillance camera array) matches Zedcor capability. Stage is active RFP — bids close 2026-05-30. Distance well within HOU-002 service radius. Adjacent to existing customer Memorial Hermann (12mi).',
  hook: 'Reach out to TxDOT District 12 procurement (named contact in source). Lead with Zedcor\'s prior I-10 corridor work (2024) — analogous scope, completed on schedule.',
};

// A. Centered modal (per brief)
function ProjectModalCenter({ showAnnotations }) {
  return (
    <SurfShell>
      {/* dimmed dashboard behind */}
      <div style={{ filter: 'blur(0.5px)', opacity: 0.55 }}>
        <BaseChrome
          mapChildren={<MapStub width={SURF_W - 240 - 360} height={SURF_H - 48} />}
          rightRail={<div style={{ width: 360, borderLeft: `1px solid ${WF.ruleSoft}` }} />}
        />
      </div>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(29,27,24,0.35)' }} />
      {/* modal */}
      <div style={{
        position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
        width: 720, maxHeight: 660,
        background: WF.paper, border: `1px solid ${WF.ink}`,
        boxShadow: '8px 8px 0 rgba(29,27,24,0.15)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: 24, borderBottom: `1px solid ${WF.ruleSoft}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <Label accent>● score 94 / 100 · high-priority</Label>
            <Hand size={26} style={{ marginTop: 6 }}>{projectFixture.title}</Hand>
            <Label size={9} style={{ marginTop: 8 }}>{projectFixture.sourceId} · {projectFixture.source} · posted {projectFixture.posted}</Label>
          </div>
          <Label size={11} style={{ cursor: 'pointer' }}>esc ✕</Label>
        </div>
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18, overflow: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            <Counter value={projectFixture.value} label="value" />
            <Counter value={projectFixture.stage.split(' — ')[0]} label="stage" />
            <Counter value="12.4mi" label="dist · HOU-002" />
            <Counter value="2026-05-30" label="bids close" />
          </div>
          <Box label="claude rationale" accent style={{ padding: 14 }}>
            <Body size={12} style={{ lineHeight: 1.5 }}>{projectFixture.rationale}</Body>
          </Box>
          <Box label="recommended outreach" style={{ padding: 14 }}>
            <Body size={12} style={{ lineHeight: 1.5 }}>{projectFixture.hook}</Body>
          </Box>
          <div style={{ display: 'flex', gap: 10 }}>
            <Box style={{ padding: '8px 14px', borderColor: WF.ink }}><Label>↗ open source record</Label></Box>
            <Box style={{ padding: '8px 14px' }}><Label>▾ raw payload (jsonb)</Label></Box>
          </div>
        </div>
      </div>
      {showAnnotations && (
        <Note style={{ position: 'absolute', top: 80, right: 50, transform: 'rotate(2deg)' }}>
          centered modal<br/>= per the brief
        </Note>
      )}
    </SurfShell>
  );
}

// B. Right-side drawer
function ProjectDrawerRight({ showAnnotations }) {
  return (
    <SurfShell>
      <BaseChrome
        mapChildren={<MapStub width={SURF_W - 240 - 480} height={SURF_H - 48}>
          <Pin x={300} y={280} kind="branch" label="HOU" />
          {[[260,240],[340,260],[320,310]].map((p, i) =>
            <Pin key={i} x={p[0]} y={p[1]} kind={i === 0 ? 'project-hi' : 'project'} />
          )}
          {/* selected pulse */}
          <div style={{ position: 'absolute', left: 260, top: 240, transform: 'translate(-50%,-50%)', width: 22, height: 22, border: `2px solid ${WF.accent}`, borderRadius: '50%' }} />
        </MapStub>}
        rightRail={
          <div style={{ width: 480, borderLeft: `1px solid ${WF.ink}`, background: WF.paper, padding: 22, display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Label accent>● 94 · high-priority</Label>
              <Label size={11}>← close</Label>
            </div>
            <Hand size={22}>{projectFixture.title}</Hand>
            <Label size={9}>{projectFixture.sourceId} · sam.gov · 2026-04-22</Label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Counter value="$4.2M" label="value" />
              <Counter value="RFP" label="stage" />
              <Counter value="12.4mi" label="HOU-002" />
              <Counter value="May 30" label="bids close" />
            </div>
            <Box label="rationale" accent style={{ padding: 12 }}>
              <Body size={11.5} style={{ lineHeight: 1.5 }}>{projectFixture.rationale}</Body>
            </Box>
            <Box label="outreach hook" style={{ padding: 12 }}>
              <Body size={11.5} style={{ lineHeight: 1.5 }}>{projectFixture.hook}</Body>
            </Box>
            <Label size={9}>↗ open source · ▾ raw payload</Label>
          </div>
        }
      />
      {showAnnotations && (
        <Note style={{ position: 'absolute', top: 100, right: 470, transform: 'rotate(-2deg)' }}>
          drawer slides in →<br/>map stays visible
        </Note>
      )}
    </SurfShell>
  );
}

// C. Inline expansion in the project list
function ProjectInlineExpand({ showAnnotations }) {
  return (
    <SurfShell>
      <BaseChrome
        mapChildren={<MapStub width={SURF_W - 240 - 380} height={SURF_H - 48} showRadius radiusAt={[280, 280]} radiusSize={240}>
          <Pin x={280} y={280} kind="branch" label="HOU" />
          {[[240,240],[320,260],[300,310]].map((p, i) =>
            <Pin key={i} x={p[0]} y={p[1]} kind={i === 0 ? 'project-hi' : 'project'} />
          )}
        </MapStub>}
        rightRail={
          <div style={{ width: 380, borderLeft: `1px solid ${WF.ruleSoft}`, padding: '20px 16px', overflow: 'hidden' }}>
            <Hand size={16}>Houston · top 15</Hand>
            <div style={{ marginTop: 12 }}>
              {/* expanded item */}
              <div style={{ border: `1px solid ${WF.ink}`, padding: 14, background: WF.fill, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Label accent>● 94 · high-priority</Label>
                  <Label size={9}>▴ collapse</Label>
                </div>
                <Body size={13} weight={500} style={{ marginTop: 6 }}>{projectFixture.title}</Body>
                <Label size={8.5} style={{ marginTop: 4 }}>{projectFixture.sourceId} · sam.gov · 12.4mi</Label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                  <Counter value="$4.2M" label="value" />
                  <Counter value="May 30" label="bids close" />
                </div>
                <Box label="rationale" accent style={{ padding: 10, marginTop: 12 }}>
                  <Body size={11} style={{ lineHeight: 1.45 }}>{projectFixture.rationale.slice(0, 160)}…</Body>
                </Box>
                <Box label="hook" style={{ padding: 10, marginTop: 8 }}>
                  <Body size={11} style={{ lineHeight: 1.45 }}>{projectFixture.hook.slice(0, 140)}…</Body>
                </Box>
                <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                  <Label size={9}>↗ source</Label>
                  <Label size={9}>▾ raw</Label>
                </div>
              </div>
              {/* collapsed siblings */}
              {[['Harris Co. detention',91,true],['Federal courthouse',87],['METRO bus depot',83]].map((p, i) => (
                <div key={i} style={{ padding: '10px 0', borderBottom: `1px solid ${WF.ruleHair}` }}>
                  <Body size={11.5} weight={500}>{p[0]}</Body>
                  <ScoreBar value={p[1]} accent={p[2]} />
                </div>
              ))}
            </div>
          </div>
        }
      />
      {showAnnotations && (
        <Note style={{ position: 'absolute', top: 90, right: 60, transform: 'rotate(-2deg)' }}>
          expand-in-place<br/>(no overlay context-switch)
        </Note>
      )}
    </SurfShell>
  );
}

// ─────────────────────────────────────────────────────────────
// CROSS-POLLINATION — 4 directions for the warm-intro view
// ─────────────────────────────────────────────────────────────

// Common: customer markers + a warm-intro pin somewhere on the map
function crossPollPins() {
  return (
    <>
      <Pin x={300} y={280} kind="branch" label="HOU" />
      <Pin x={520} y={220} kind="branch" label="ATL" />
      <Pin x={150} y={150} kind="branch" label="PHX" />
      {/* customers */}
      {[[280,260],[320,300],[260,290],[510,210],[540,240],[160,160],[170,140]].map((c, i) =>
        <Pin key={'c'+i} x={c[0]} y={c[1]} kind="customer" />
      )}
      {/* warm intros (within 50mi of a different branch's customer) */}
      <Pin x={500} y={260} kind="warm" label="WI-1" />
      <Pin x={170} y={180} kind="warm" label="WI-2" />
      {/* normal projects */}
      {[[330,250],[290,310],[510,280]].map((p, i) =>
        <Pin key={'p'+i} x={p[0]} y={p[1]} kind="project" />
      )}
    </>
  );
}

// A. Toggle ON: warm-intros highlighted, dotted lines connect customer→opportunity
function CrossPollA({ showAnnotations }) {
  return (
    <SurfShell>
      <BaseChrome
        showCustomers
        mapChildren={
          <div style={{ position: 'relative', height: '100%' }}>
            <MapStub width={SURF_W - 240 - 360} height={SURF_H - 48}
                     showCustomerWarmth={[[510, 220], [160, 150]]}>
              {crossPollPins()}
              {/* connecting lines */}
              <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} width="100%" height="100%">
                <line x1="510" y1="220" x2="500" y2="260" stroke={WF.accent} strokeWidth="1" strokeDasharray="3,3" />
                <line x1="160" y1="150" x2="170" y2="180" stroke={WF.accent} strokeWidth="1" strokeDasharray="3,3" />
              </svg>
            </MapStub>
            {/* legend */}
            <div style={{ position: 'absolute', bottom: 12, left: 12, background: WF.paper, border: `1px solid ${WF.ruleSoft}`, padding: '8px 12px', display: 'flex', gap: 14 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', border: `1px solid ${WF.ink}` }} /><Label size={8}>customer</Label>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, background: WF.accent, transform: 'rotate(45deg)' }} /><Label size={8} accent>warm-intro</Label>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 14, height: 0, borderTop: `1px dashed ${WF.accent}` }} /><Label size={8} accent>50mi link</Label>
              </span>
            </div>
          </div>
        }
        rightRail={
          <div style={{ width: 360, borderLeft: `1px solid ${WF.ruleSoft}`, padding: '20px 16px' }}>
            <Hand size={16}>Cross-pollination · 2 warm intros</Hand>
            <Label style={{ marginTop: 4 }}>customer of branch X near opp of branch Y</Label>
            {[
              ['ATL · Centennial Trust', 'opp: Atlanta courthouse RFP', '34mi'],
              ['PHX · Banner Health',     'opp: Maricopa Co. records', '21mi'],
            ].map((w, i) => (
              <div key={i} style={{ marginTop: 14, padding: 12, border: `1px dashed ${WF.accent}`, background: WF.accentSoft }}>
                <Label accent>WI-{i+1} · warm-intro</Label>
                <Body size={11.5} weight={500} style={{ marginTop: 4 }}>{w[0]}</Body>
                <Label size={9} style={{ marginTop: 2 }}>{w[1]} · {w[2]}</Label>
              </div>
            ))}
          </div>
        }
      />
      {showAnnotations && (
        <Note style={{ position: 'absolute', top: 280, left: 600, transform: 'rotate(-3deg)' }}>
          dashed link =<br/>customer ↔ opp<br/>(50mi rule)
        </Note>
      )}
    </SurfShell>
  );
}

// B. Map mode shift: branches and projects go grayscale, customers/warm pop
function CrossPollB({ showAnnotations }) {
  return (
    <SurfShell>
      <BaseChrome
        showCustomers
        mapChildren={
          <div style={{ position: 'relative', height: '100%' }}>
            <MapStub width={SURF_W - 240 - 360} height={SURF_H - 48} dim>
              {/* desaturated branches */}
              <div style={{ opacity: 0.35 }}>{crossPollPins()}</div>
            </MapStub>
            {/* re-render warm-intros + customers on top, full color */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              {[[280,260],[320,300],[510,210],[540,240],[160,160]].map((c, i) =>
                <Pin key={i} x={c[0]} y={c[1]} kind="customer" />
              )}
              <Pin x={500} y={260} kind="warm" label="WI-1 · 21mi" />
              <Pin x={170} y={180} kind="warm" label="WI-2 · 34mi" />
            </div>
            <div style={{ position: 'absolute', top: 16, left: 16, padding: '6px 10px', background: WF.accent, color: WF.paper, font: `500 9px ${WF.mono}`, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              ● cross-pollination mode
            </div>
          </div>
        }
        rightRail={
          <div style={{ width: 360, borderLeft: `1px solid ${WF.ruleSoft}`, padding: '20px 16px' }}>
            <Hand size={16}>Warm-intro candidates</Hand>
            <Label>map shifts · only relevant pins</Label>
            <Box label="WI-1" accent style={{ padding: 12, marginTop: 14 }}>
              <Body size={11.5} weight={500}>Maricopa Co. records modernization</Body>
              <Label size={9} style={{ marginTop: 4 }}>$2.8M · RFP · 21mi from Banner Health (PHX customer)</Label>
            </Box>
            <Box label="WI-2" accent style={{ padding: 12, marginTop: 10 }}>
              <Body size={11.5} weight={500}>Atlanta federal courthouse RFP</Body>
              <Label size={9} style={{ marginTop: 4 }}>$5.1M · RFP · 34mi from Centennial Trust (ATL customer)</Label>
            </Box>
          </div>
        }
      />
      {showAnnotations && (
        <Note style={{ position: 'absolute', top: 70, left: 360, transform: 'rotate(-2deg)' }}>
          map dims · only<br/>warm pairs in color
        </Note>
      )}
    </SurfShell>
  );
}

// C. Split view — left half normal, right half annotated for warm-intros
function CrossPollC({ showAnnotations }) {
  return (
    <SurfShell>
      <BaseChrome
        showCustomers
        mapChildren={
          <div style={{ position: 'relative', height: '100%' }}>
            <MapStub width={SURF_W - 240 - 360} height={SURF_H - 48}>
              {crossPollPins()}
              {/* customer warmth halos */}
              <div style={{ position: 'absolute', left: 510 - 40, top: 220 - 40, width: 80, height: 80, border: `1px dotted ${WF.accent}`, borderRadius: '50%' }} />
              <div style={{ position: 'absolute', left: 160 - 40, top: 150 - 40, width: 80, height: 80, border: `1px dotted ${WF.accent}`, borderRadius: '50%' }} />
            </MapStub>
            <div style={{ position: 'absolute', top: 16, right: 16, background: WF.paper, border: `1px solid ${WF.ruleSoft}`, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Label>halo = 50mi customer reach</Label>
              <Label accent>○ warm-intro = inside halo</Label>
            </div>
          </div>
        }
        rightRail={
          <div style={{ width: 360, borderLeft: `1px solid ${WF.ruleSoft}`, padding: '20px 16px' }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              <Pill>all opps</Pill>
              <Pill active accent>warm-intros (2)</Pill>
            </div>
            <Hand size={16}>Sorted by warmth</Hand>
            {[
              ['Maricopa Co. records', 'PHX · Banner Health · 21mi', 96, 'warm'],
              ['ATL courthouse RFP', 'ATL · Centennial · 34mi', 88, 'warm'],
              ['TxDOT corridor', 'no nearby customer', 94, 'cold'],
            ].map((p, i) => (
              <div key={i} style={{ padding: '10px 0', borderBottom: `1px solid ${WF.ruleHair}` }}>
                <Body size={11.5} weight={500}>{p[0]}</Body>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <Label size={9} accent={p[3] === 'warm'}>{p[3] === 'warm' ? '◆' : '○'} {p[1]}</Label>
                  <ScoreBar value={p[2]} accent={p[3] === 'warm'} />
                </div>
              </div>
            ))}
          </div>
        }
      />
      {showAnnotations && (
        <Note style={{ position: 'absolute', top: 280, left: 200, transform: 'rotate(-3deg)' }}>
          dotted halos = each<br/>customer's 50mi field
        </Note>
      )}
    </SurfShell>
  );
}

// D. Network view: graph overlay connecting branches → customers → warm-intros
function CrossPollD({ showAnnotations }) {
  return (
    <SurfShell>
      <BaseChrome
        showCustomers
        mapChildren={
          <div style={{ position: 'relative', height: '100%' }}>
            <MapStub width={SURF_W - 240 - 360} height={SURF_H - 48} dim showGrid={false}>
              <svg style={{ position: 'absolute', inset: 0 }} width="100%" height="100%">
                {/* branch → its customers */}
                <line x1="300" y1="280" x2="280" y2="260" stroke={WF.ink} strokeOpacity="0.4" />
                <line x1="300" y1="280" x2="320" y2="300" stroke={WF.ink} strokeOpacity="0.4" />
                <line x1="520" y1="220" x2="510" y2="210" stroke={WF.ink} strokeOpacity="0.4" />
                <line x1="520" y1="220" x2="540" y2="240" stroke={WF.ink} strokeOpacity="0.4" />
                <line x1="150" y1="150" x2="160" y2="160" stroke={WF.ink} strokeOpacity="0.4" />
                {/* customer → warm-intro (cross-branch) */}
                <line x1="510" y1="210" x2="500" y2="260" stroke={WF.accent} strokeWidth="1.5" />
                <line x1="160" y1="160" x2="170" y2="180" stroke={WF.accent} strokeWidth="1.5" />
              </svg>
              {crossPollPins()}
            </MapStub>
            <div style={{ position: 'absolute', top: 16, left: 16, font: `500 9px ${WF.mono}`, color: WF.inkDim, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              network mode · branch → customer → opp
            </div>
          </div>
        }
        rightRail={
          <div style={{ width: 360, borderLeft: `1px solid ${WF.ruleSoft}`, padding: '20px 16px' }}>
            <Hand size={16}>Warm-intro pathways</Hand>
            <Label>traversal: branch → customer → opp</Label>
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                ['ATL-003', 'Centennial Trust', 'Atlanta courthouse RFP', '34mi'],
                ['PHX-001', 'Banner Health', 'Maricopa records', '21mi'],
              ].map((p, i) => (
                <div key={i} style={{ padding: 12, border: `1px solid ${WF.ruleSoft}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: `500 9.5px ${WF.mono}`, color: WF.inkDim }}>
                    <span style={{ color: WF.ink }}>{p[0]}</span>
                    <span>→</span>
                    <span style={{ color: WF.ink }}>{p[1]}</span>
                    <span>→</span>
                    <span style={{ color: WF.accent }}>opp</span>
                  </div>
                  <Body size={11.5} weight={500} style={{ marginTop: 6 }}>{p[2]}</Body>
                  <Label size={9} accent style={{ marginTop: 3 }}>● warm-intro · {p[3]}</Label>
                </div>
              ))}
            </div>
          </div>
        }
      />
      {showAnnotations && (
        <Note style={{ position: 'absolute', top: 240, left: 320, transform: 'rotate(-2deg)' }}>
          graph overlay<br/>shows the relationship
        </Note>
      )}
    </SurfShell>
  );
}

Object.assign(window, {
  BranchFocusA, BranchFocusB, BranchFocusC, BranchFocusD,
  ProjectModalCenter, ProjectDrawerRight, ProjectInlineExpand,
  CrossPollA, CrossPollB, CrossPollC, CrossPollD,
});
