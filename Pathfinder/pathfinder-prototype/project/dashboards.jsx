// dashboards.jsx
// 4 main-dashboard wireframes for Pathfinder.
// Each is a 1280×800 frame at scale 0.7 inside its artboard.
// Greybox: boxes-and-labels, hand-lettered headings, mono labels.

// Shared layout helpers
const FRAME_W = 1280, FRAME_H = 800;

function FrameShell({ children, dark, scale = 0.7, w = FRAME_W, h = FRAME_H, paper }) {
  return (
    <div style={{
      width: w * scale, height: h * scale,
      overflow: 'hidden',
      background: paper || (dark ? '#1a1a1a' : WF.paper),
      position: 'relative',
    }}>
      <div style={{
        width: w, height: h,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        position: 'relative',
      }}>{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 1. LINEAR-ish — calm left rail, generous spacing
// ─────────────────────────────────────────────────────────────
function DashboardLinear({ showAnnotations }) {
  return (
    <FrameShell>
      {/* Top bar */}
      <div style={{
        height: 48, borderBottom: `1px solid ${WF.ruleSoft}`,
        display: 'flex', alignItems: 'center', padding: '0 20px',
        gap: 24,
      }}>
        <Hand size={18}>Pathfinder</Hand>
        <Label>field intel · v0.1</Label>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          <Pill active>all sources</Pill>
          <Pill>USAspending</Pill>
          <Pill>SAM.gov</Pill>
          <Pill>News</Pill>
          <Pill>Harris Co.</Pill>
        </div>
        <div style={{ flex: 1 }} />
        <Counter value="247" label="new · 24h" />
      </div>

      <div style={{ display: 'flex', height: 'calc(100% - 48px)' }}>
        {/* Left rail: branches */}
        <div style={{
          width: 260, borderRight: `1px solid ${WF.ruleSoft}`,
          padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <Label>branches · 5</Label>
          {['phx-001', 'hou-002', 'atl-003', 'chi-004', 'sea-005'].map((b, i) => (
            <div key={b} style={{
              padding: '10px 12px',
              border: `1px solid ${i === 1 ? WF.ink : WF.ruleSoft}`,
              background: i === 1 ? WF.fill : 'transparent',
              display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Body weight={500}>{['Phoenix','Houston','Atlanta','Chicago','Seattle'][i]}</Body>
                <span style={{ font: `500 10px ${WF.mono}`, color: WF.ink }}>{[12,28,9,15,7][i]}</span>
              </div>
              <Label size={8.5}>{b} · 300mi radius</Label>
              {i === 1 && <Label size={8.5} accent>● 4 high-priority</Label>}
            </div>
          ))}
        </div>

        {/* Center: map */}
        <div style={{ flex: 1, position: 'relative', padding: 16 }}>
          <MapStub width={FRAME_W - 260 - 360 - 32} height={FRAME_H - 48 - 32}
                   showRadius radiusAt={[260, 220]} radiusSize={220}>
            <Pin x={120} y={140} kind="branch" label="PHX" />
            <Pin x={260} y={220} kind="branch" label="HOU" />
            <Pin x={420} y={180} kind="branch" label="ATL" />
            <Pin x={340} y={120} kind="branch" label="CHI" />
            <Pin x={90}  y={70}  kind="branch" label="SEA" />
            {/* projects clustered around Houston */}
            {[[230,180],[280,200],[300,240],[250,260],[210,230],[290,180],[310,210]].map((p, i) =>
              <Pin key={i} x={p[0]} y={p[1]} kind={i < 2 ? 'project-hi' : 'project'} />
            )}
          </MapStub>
          {showAnnotations && (
            <Note style={{ position: 'absolute', top: 240, left: 540, transform: 'rotate(-3deg)' }}>
              ↖ coverage radius<br/>only on selected branch
            </Note>
          )}
        </div>

        {/* Right rail: ranked projects */}
        <div style={{
          width: 360, borderLeft: `1px solid ${WF.ruleSoft}`,
          padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 10,
          overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Hand size={16}>Houston · top projects</Hand>
            <Label size={8.5}>sort: score</Label>
          </div>
          <Label>15 results · ranked by Claude</Label>
          {[
            { t: 'TxDOT corridor expansion bid', src: 'sam.gov', d: '12 mi', s: 94, hi: true },
            { t: 'Harris Co. detention upgrade', src: 'harris', d: '8 mi', s: 91, hi: true },
            { t: 'Federal courthouse perimeter RFP', src: 'usa', d: '34 mi', s: 87 },
            { t: 'Port of Houston news mention', src: 'news', d: '22 mi', s: 76 },
            { t: 'Energy corridor security study', src: 'sam.gov', d: '41 mi', s: 71 },
            { t: 'Memorial Hermann campus expansion', src: 'news', d: '17 mi', s: 68 },
          ].map((p, i) => (
            <div key={i} style={{
              padding: '10px 0', borderBottom: `1px solid ${WF.ruleHair}`,
              display: 'flex', flexDirection: 'column', gap: 5,
            }}>
              <Body size={11.5} weight={500}>{p.t}</Body>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Label size={8.5}>{p.src} · {p.d}</Label>
                <ScoreBar value={p.s} accent={p.hi} />
              </div>
            </div>
          ))}
        </div>
      </div>
      {showAnnotations && (
        <Note style={{ position: 'absolute', top: 70, left: 16, transform: 'rotate(-2deg)' }}>
          ← left rail = branches<br/>(selected = highlight)
        </Note>
      )}
    </FrameShell>
  );
}

// ─────────────────────────────────────────────────────────────
// 2. BLOOMBERG-ish — dense, every pixel earns its place
// ─────────────────────────────────────────────────────────────
function DashboardBloomberg({ showAnnotations }) {
  return (
    <FrameShell>
      {/* Ultra-dense top status strip */}
      <div style={{
        height: 28, borderBottom: `1px solid ${WF.rule}`,
        display: 'flex', alignItems: 'center', padding: '0 12px', gap: 16,
        font: `500 10px ${WF.mono}`,
        background: WF.fill,
      }}>
        <span style={{ fontWeight: 700 }}>PATHFINDER</span>
        <span>· FIELD-INTEL · v0.1</span>
        <span style={{ marginLeft: 'auto' }}>RUN: 04:00:12 UTC</span>
        <span>STATUS: ●LIVE</span>
        <span>PULL: 3,402</span>
        <span>NEW/24h: <b style={{ color: WF.accent }}>247</b></span>
        <span>RANK QUEUE: 12</span>
        <span>ERR: 0</span>
      </div>

      {/* Filter strip */}
      <div style={{
        height: 32, borderBottom: `1px solid ${WF.ruleSoft}`,
        display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8,
      }}>
        <Label>sources:</Label>
        <Pill active>all</Pill>
        <Pill>USA</Pill>
        <Pill>SAM</Pill>
        <Pill>NEWS</Pill>
        <Pill>HC</Pill>
        <span style={{ width: 16 }} />
        <Label>view:</Label>
        <Pill active>opportunities</Pill>
        <Pill>customers</Pill>
        <Pill>warm-intros</Pill>
        <span style={{ marginLeft: 'auto' }} />
        <Label>min score:</Label>
        <span style={{ font: `500 10px ${WF.mono}` }}>60 ▬▬▬▬▬▬○▬▬▬</span>
      </div>

      <div style={{ display: 'flex', height: 'calc(100% - 60px)' }}>
        {/* Branches table — left */}
        <div style={{ width: 280, borderRight: `1px solid ${WF.ruleSoft}` }}>
          <div style={{ padding: '8px 12px', borderBottom: `1px solid ${WF.ruleSoft}`, display: 'flex', justifyContent: 'space-between' }}>
            <Label>branches</Label><Label>n=5</Label>
          </div>
          {[['PHX-001','Phoenix',12,2,'AZ'],['HOU-002','Houston',28,4,'TX'],['ATL-003','Atlanta',9,1,'GA'],['CHI-004','Chicago',15,2,'IL'],['SEA-005','Seattle',7,0,'WA']].map((b, i) => (
            <div key={b[0]} style={{
              display: 'grid',
              gridTemplateColumns: '70px 1fr 30px 30px',
              padding: '8px 12px', gap: 6,
              borderBottom: `1px solid ${WF.ruleHair}`,
              background: i === 1 ? WF.fillMid : 'transparent',
              alignItems: 'center',
            }}>
              <span style={{ font: `500 10px ${WF.mono}`, color: WF.inkDim }}>{b[0]}</span>
              <Body size={11} weight={500}>{b[1]}</Body>
              <span style={{ font: `500 10px ${WF.mono}`, textAlign: 'right' }}>{b[2]}</span>
              <span style={{ font: `500 10px ${WF.mono}`, textAlign: 'right', color: b[3] > 0 ? WF.accent : WF.inkFaint }}>{b[3]}</span>
            </div>
          ))}
          <div style={{ padding: '6px 12px', borderTop: `1px solid ${WF.ruleSoft}`, display: 'grid', gridTemplateColumns: '70px 1fr 30px 30px' }}>
            <Label size={8}>code</Label><Label size={8}>name</Label>
            <Label size={8} style={{ textAlign: 'right' }}>n</Label>
            <Label size={8} style={{ textAlign: 'right' }} accent>hi</Label>
          </div>

          {/* Counters block */}
          <div style={{ padding: 12, borderTop: `1px solid ${WF.rule}`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Counter value="3,402" label="total tracked" big />
            <Counter value="247" label="new · 24h" big />
            <Counter value="71" label="ranked · 24h" />
            <Counter value="0" label="errors" />
          </div>
        </div>

        {/* Map — center */}
        <div style={{ flex: 1, position: 'relative' }}>
          <MapStub width={FRAME_W - 280 - 380} height={FRAME_H - 60} showGrid={false}
                   showRadius radiusAt={[280, 240]} radiusSize={200}>
            <Pin x={130} y={150} kind="branch" label="PHX" />
            <Pin x={280} y={240} kind="branch" label="HOU" />
            <Pin x={440} y={200} kind="branch" label="ATL" />
            <Pin x={360} y={130} kind="branch" label="CHI" />
            <Pin x={100} y={80}  kind="branch" label="SEA" />
            {Array.from({length: 18}, (_, i) => {
              const cx = [280,440,360,130,100][i % 5];
              const cy = [240,200,130,150,80][i % 5];
              return <Pin key={i} x={cx + (Math.cos(i*1.7)*60)} y={cy + (Math.sin(i*2.1)*40)}
                          kind={i % 7 === 0 ? 'project-hi' : 'project'} />;
            })}
          </MapStub>
          {/* mini scale strip */}
          <div style={{ position: 'absolute', bottom: 8, left: 8, font: `500 9px ${WF.mono}`, color: WF.inkDim }}>
            ─── 100mi · 31.95°N -95.36°W · zoom 5
          </div>
        </div>

        {/* Project table — right */}
        <div style={{ width: 380, borderLeft: `1px solid ${WF.ruleSoft}` }}>
          <div style={{
            padding: '8px 12px', borderBottom: `1px solid ${WF.ruleSoft}`,
            display: 'grid', gridTemplateColumns: '40px 1fr 50px 36px',
            gap: 6, alignItems: 'center',
          }}>
            <Label size={8}>score</Label><Label size={8}>title / source</Label>
            <Label size={8}>dist</Label><Label size={8}>stage</Label>
          </div>
          {[
            ['94','TxDOT corridor expansion bid','sam.gov','12mi','RFP', true],
            ['91','Harris Co. detention upgrade','harris','8mi','PRE',  true],
            ['87','Federal courthouse perimeter','usa','34mi','RFP',    false],
            ['83','METRO bus depot retrofit','harris','19mi','PLN',     false],
            ['76','Port of Houston news mention','news','22mi','NWS',   false],
            ['71','Energy corridor security study','sam.gov','41mi','PLN', false],
            ['68','Memorial Hermann campus expansion','news','17mi','NWS', false],
            ['65','Galveston Co. flood control','usa','58mi','RFP',     false],
            ['61','Sugar Land municipal complex','harris','24mi','PRE', false],
          ].map((r, i) => (
            <div key={i} style={{
              padding: '8px 12px',
              display: 'grid', gridTemplateColumns: '40px 1fr 50px 36px',
              gap: 6, alignItems: 'center',
              borderBottom: `1px solid ${WF.ruleHair}`,
              background: i % 2 === 0 ? WF.fill : 'transparent',
            }}>
              <span style={{ font: `600 11px ${WF.mono}`, color: r[5] ? WF.accent : WF.ink }}>{r[0]}</span>
              <div>
                <Body size={11} weight={500}>{r[1]}</Body>
                <Label size={8.5}>{r[2]}</Label>
              </div>
              <span style={{ font: `500 10px ${WF.mono}`, color: WF.inkDim }}>{r[3]}</span>
              <span style={{ font: `500 9px ${WF.mono}`, color: WF.inkDim, padding: '2px 4px', border: `1px solid ${WF.ruleSoft}`, textAlign: 'center' }}>{r[4]}</span>
            </div>
          ))}
        </div>
      </div>
      {showAnnotations && (
        <>
          <Note style={{ position: 'absolute', top: 6, right: 200, transform: 'rotate(2deg)' }}>
            ↑ status strip = system pulse
          </Note>
          <Note style={{ position: 'absolute', bottom: 100, right: 30, transform: 'rotate(-2deg)' }}>
            table view → sortable<br/>cols, dense, no fluff
          </Note>
        </>
      )}
    </FrameShell>
  );
}

// ─────────────────────────────────────────────────────────────
// 3. MAPBOX-FORWARD — full-bleed map, floating panels
// ─────────────────────────────────────────────────────────────
function DashboardMapForward({ showAnnotations }) {
  return (
    <FrameShell>
      <div style={{ position: 'absolute', inset: 0 }}>
        <MapStub width={FRAME_W} height={FRAME_H} showGrid={false}
                 showRadius radiusAt={[700, 460]} radiusSize={260}>
          <Pin x={420} y={340} kind="branch" label="PHX" />
          <Pin x={700} y={460} kind="branch" label="HOU" />
          <Pin x={960} y={400} kind="branch" label="ATL" />
          <Pin x={820} y={250} kind="branch" label="CHI" />
          <Pin x={350} y={170} kind="branch" label="SEA" />
          {[[660,420],[720,490],[750,440],[680,510],[640,460],[710,400],[760,510]].map((p, i) =>
            <Pin key={i} x={p[0]} y={p[1]} kind={i < 2 ? 'project-hi' : 'project'} />
          )}
        </MapStub>
      </div>

      {/* Floating top bar */}
      <div style={{
        position: 'absolute', top: 16, left: 16, right: 16,
        height: 48,
        background: 'rgba(244,241,234,0.92)',
        backdropFilter: 'blur(6px)',
        border: `1px solid ${WF.ruleSoft}`,
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 16,
      }}>
        <Hand size={17}>Pathfinder</Hand>
        <span style={{ width: 1, height: 20, background: WF.ruleSoft }} />
        <Pill active>all sources</Pill>
        <Pill>USA</Pill><Pill>SAM</Pill><Pill>News</Pill><Pill>HC</Pill>
        <span style={{ width: 1, height: 20, background: WF.ruleSoft }} />
        <Pill>show customers</Pill>
        <Pill accent>warm-intros</Pill>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, alignItems: 'center' }}>
          <Counter value="247" label="new · 24h" />
          <Counter value="3,402" label="tracked" />
        </div>
      </div>

      {/* Floating left: branch dock */}
      <div style={{
        position: 'absolute', top: 88, left: 16, width: 220,
        background: 'rgba(244,241,234,0.92)',
        backdropFilter: 'blur(6px)',
        border: `1px solid ${WF.ruleSoft}`,
        padding: 12,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <Label>branches</Label><Label>5</Label>
        </div>
        {['Phoenix','Houston','Atlanta','Chicago','Seattle'].map((n, i) => (
          <div key={n} style={{
            padding: '6px 8px', marginBottom: 2,
            background: i === 1 ? WF.ink : 'transparent',
            color: i === 1 ? WF.paper : WF.ink,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <Body size={11} weight={500} color={i === 1 ? WF.paper : WF.ink}>{n}</Body>
            <span style={{ font: `500 10px ${WF.mono}`, color: i === 1 ? WF.paper : WF.inkDim }}>{[12,28,9,15,7][i]}</span>
          </div>
        ))}
      </div>

      {/* Floating right: ranked list */}
      <div style={{
        position: 'absolute', top: 88, right: 16, bottom: 16, width: 340,
        background: 'rgba(244,241,234,0.94)',
        backdropFilter: 'blur(6px)',
        border: `1px solid ${WF.ruleSoft}`,
        padding: 16, display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <Hand size={16}>Houston · ranked</Hand>
        <Label>15 projects · top 6 shown</Label>
        {[
          ['TxDOT corridor expansion','sam.gov · 12mi',94,true],
          ['Harris Co. detention','harris · 8mi',91,true],
          ['Federal courthouse RFP','usa · 34mi',87],
          ['METRO bus depot','harris · 19mi',83],
          ['Port of Houston news','news · 22mi',76],
          ['Energy corridor study','sam.gov · 41mi',71],
        ].map((p, i) => (
          <div key={i} style={{ padding: '8px 0', borderBottom: `1px solid ${WF.ruleHair}` }}>
            <Body size={11.5} weight={500}>{p[0]}</Body>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <Label size={8.5}>{p[1]}</Label>
              <ScoreBar value={p[2]} accent={p[3]} />
            </div>
          </div>
        ))}
      </div>

      {/* Floating bottom-left mini legend */}
      <div style={{
        position: 'absolute', bottom: 16, left: 16,
        background: 'rgba(244,241,234,0.92)',
        backdropFilter: 'blur(6px)',
        border: `1px solid ${WF.ruleSoft}`,
        padding: '8px 12px',
        display: 'flex', gap: 14, alignItems: 'center',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 12, height: 12, background: WF.ink, outline: `1px solid ${WF.ink}`, border: `2px solid ${WF.paper}` }} />
          <Label size={8.5}>branch</Label>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 8, height: 8, background: WF.ink, borderRadius: '50%' }} />
          <Label size={8.5}>project</Label>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 9, height: 9, background: WF.accent, borderRadius: '50%' }} />
          <Label size={8.5} accent>high-priority</Label>
        </span>
      </div>

      {showAnnotations && (
        <Note style={{ position: 'absolute', top: 80, left: 260, transform: 'rotate(-2deg)' }}>
          map = protagonist<br/>panels float · recede
        </Note>
      )}
    </FrameShell>
  );
}

// ─────────────────────────────────────────────────────────────
// 4. MISSION CONTROL — operational, status-heavy, bottom dock
// ─────────────────────────────────────────────────────────────
function DashboardMissionControl({ showAnnotations }) {
  return (
    <FrameShell>
      {/* Top: large branch grid as primary nav */}
      <div style={{
        height: 96, display: 'grid', gridTemplateColumns: '1.2fr repeat(5, 1fr) 1.2fr',
        borderBottom: `1px solid ${WF.rule}`,
      }}>
        <div style={{
          padding: 14, borderRight: `1px solid ${WF.ruleSoft}`,
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        }}>
          <div>
            <Hand size={20}>Pathfinder</Hand>
            <Label>field ops dashboard</Label>
          </div>
          <Label>● live</Label>
        </div>
        {[
          ['PHX','Phoenix',12,0],
          ['HOU','Houston',28,4],
          ['ATL','Atlanta',9,1],
          ['CHI','Chicago',15,2],
          ['SEA','Seattle',7,0],
        ].map((b, i) => (
          <div key={b[0]} style={{
            padding: 12, borderRight: `1px solid ${WF.ruleSoft}`,
            background: i === 1 ? WF.ink : 'transparent',
            color: i === 1 ? WF.paper : WF.ink,
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          }}>
            <Label size={9} color={i === 1 ? WF.inkFaint : WF.inkDim}>{b[0]}-00{i+1}</Label>
            <Body size={13} weight={500} color={i === 1 ? WF.paper : WF.ink}>{b[1]}</Body>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ font: `600 22px ${WF.mono}`, color: i === 1 ? WF.paper : WF.ink }}>{b[2]}</span>
              {b[3] > 0 && <Label size={9} accent>{b[3]} hi-pri</Label>}
            </div>
          </div>
        ))}
        <div style={{ padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Counter value="247" label="new · 24h" big />
          <Counter value="3,402" label="tracked" big />
          <Counter value="71" label="ranked" />
          <Counter value="0" label="errors" />
        </div>
      </div>

      {/* Filter strip */}
      <div style={{
        height: 32, borderBottom: `1px solid ${WF.ruleSoft}`,
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 8,
      }}>
        <Label>filter:</Label>
        <Pill active>all sources</Pill>
        <Pill>USAspending</Pill><Pill>SAM.gov</Pill><Pill>Google News</Pill><Pill>Harris Co.</Pill>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Pill>show customers</Pill>
          <Pill accent>cross-pollination</Pill>
        </span>
      </div>

      {/* Map + bottom dock */}
      <div style={{ position: 'relative', height: 'calc(100% - 96px - 32px)' }}>
        <MapStub width={FRAME_W} height={FRAME_H - 96 - 32 - 220} showGrid={false}
                 showRadius radiusAt={[680, 280]} radiusSize={260}>
          <Pin x={400} y={210} kind="branch" label="PHX" />
          <Pin x={680} y={280} kind="branch" label="HOU" />
          <Pin x={930} y={240} kind="branch" label="ATL" />
          <Pin x={790} y={130} kind="branch" label="CHI" />
          <Pin x={330} y={70}  kind="branch" label="SEA" />
          {[[640,250],[720,300],[700,330],[660,210],[760,260],[610,290]].map((p, i) =>
            <Pin key={i} x={p[0]} y={p[1]} kind={i < 2 ? 'project-hi' : 'project'} />
          )}
        </MapStub>

        {/* Bottom dock: ranked feed as horizontal cards */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: 220, borderTop: `1px solid ${WF.rule}`,
          background: WF.paper,
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '8px 16px', borderBottom: `1px solid ${WF.ruleSoft}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <Hand size={14}>Houston · ranked feed</Hand>
            <Label>15 projects · scroll →</Label>
          </div>
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: 12, gap: 12 }}>
            {[
              ['TxDOT corridor expansion','sam.gov',94,'12mi','RFP',true],
              ['Harris Co. detention','harris',91,'8mi','PRE',true],
              ['Federal courthouse','usa',87,'34mi','RFP',false],
              ['METRO bus depot','harris',83,'19mi','PLN',false],
              ['Port of Houston news','news',76,'22mi','NWS',false],
              ['Energy corridor study','sam.gov',71,'41mi','PLN',false],
            ].map((p, i) => (
              <div key={i} style={{
                width: 200, flexShrink: 0,
                border: `1px solid ${p[5] ? WF.accent : WF.ruleSoft}`,
                background: p[5] ? WF.accentSoft : 'transparent',
                padding: 10, display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Label size={8.5}>{p[1]}</Label>
                  <Label size={8.5} accent={p[5]}>● {p[4]}</Label>
                </div>
                <Body size={11.5} weight={500}>{p[0]}</Body>
                <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Label size={8.5}>{p[3]}</Label>
                  <ScoreBar value={p[2]} accent={p[5]} w={50} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {showAnnotations && (
        <>
          <Note style={{ position: 'absolute', top: 30, right: 280, transform: 'rotate(-2deg)' }}>
            ↑ branches as fixed nav<br/>(always visible)
          </Note>
          <Note style={{ position: 'absolute', bottom: 240, left: 30, transform: 'rotate(2deg)' }}>
            ↓ ranked feed as horizontal cards
          </Note>
        </>
      )}
    </FrameShell>
  );
}

Object.assign(window, {
  DashboardLinear, DashboardBloomberg, DashboardMapForward, DashboardMissionControl,
});
