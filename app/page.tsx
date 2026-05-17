"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startOrganism } from "./_landing/organism";

type Status = "idle" | "loading" | "success" | "error";

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const feedInnerRef = useRef<HTMLDivElement>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [role, setRole] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Bootstrap the canvas organism + feed once the refs are mounted.
  useEffect(() => {
    if (!canvasRef.current || !feedInnerRef.current) return;
    const cleanup = startOrganism({
      canvas: canvasRef.current,
      feedInner: feedInnerRef.current,
    });
    return cleanup;
  }, []);

  const openModal = useCallback(() => {
    setModalOpen(true);
    document.body.style.overflow = "hidden";
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    document.body.style.overflow = "";
    setErrorMsg("");
    if (status === "error") setStatus("idle");
  }, [status]);

  // Escape-to-close.
  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modalOpen, closeModal]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (status === "loading") return;
      setErrorMsg("");
      setStatus("loading");
      try {
        const res = await fetch("/api/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyName, role, firstName, lastName, email }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setErrorMsg(typeof data?.error === "string" ? data.error : "Something went wrong.");
          setStatus("error");
          return;
        }
        setStatus("success");
        // Auto-close after a beat so the success state lands, then reset.
        setTimeout(() => {
          setModalOpen(false);
          document.body.style.overflow = "";
          setStatus("idle");
          setCompanyName("");
          setRole("");
          setFirstName("");
          setLastName("");
          setEmail("");
        }, 1800);
      } catch {
        setErrorMsg("Network error. Please try again.");
        setStatus("error");
      }
    },
    [companyName, role, firstName, lastName, email, status],
  );

  const submitting = status === "loading";

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: LANDING_CSS }} />

      {/* Layer 1: background image */}
      <div className="bg" aria-hidden="true" />

      {/* Layer 2: arm (fingertip anchored to organism core bottom-left).
          arm-v2.png is a re-processed silhouette — solid dark ink
          wherever there was any stroke + alpha boosted 3x. The original
          arm.png had only 2.6% fully-opaque pixels which made it
          invisible on the cool-grey backdrop regardless of blend-mode
          tuning. Same pose + dimensions, just visible. */}
      <div className="arm-anchor" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/landing/arm-v2.png" alt="" />
      </div>

      {/* Layer 3: organism canvas */}
      <canvas id="engine" ref={canvasRef} />

      {/* Hero glass pane */}
      <section className="hero-pane">
        <span className="glass-grit" aria-hidden="true" />
        <div className="pane-brand fade-in d1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="mark" src="/landing/unicron-systems-logo.png" alt="Unicron Systems" />
        </div>

        <div className="pane-spacer" />

        <div className="pane-hero">
          <h2 className="eyebrow fade-in d2">We grow</h2>
          <h1 className="head fade-in d2">
            Adaptive
            <br />
            intelligence
          </h1>
          <h2 className="sub fade-in d2">
            for companies that need to spot what matters before others do
            <span className="period">.</span>
          </h2>
          <div className="pane-rule fade-in d3" />
          <a
            className="access fade-in d3"
            href="#request-demo"
            onClick={(e) => {
              e.preventDefault();
              openModal();
            }}
          >
            Get Early Access
            <span className="arrow" />
          </a>
        </div>

        <div className="pane-spacer" />
      </section>

      {/* Live signal */}
      <div className="feed fade-in d4">
        <span className="feed-label">Live Signal</span>
        <div className="feed-inner" ref={feedInnerRef} />
      </div>

      {/* Demo request modal */}
      <div
        className={"modal-backdrop" + (modalOpen ? " open" : "")}
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-title"
        aria-hidden={!modalOpen}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeModal();
        }}
      >
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <button
            className="modal-close"
            onClick={closeModal}
            aria-label="Close"
            type="button"
          >
            ×
          </button>

          {status === "success" ? (
            <>
              <h2 id="demo-title">
                Thank you<span className="period">.</span>
                <br />
                We&apos;ll be in touch.
              </h2>
              <p className="modal-privacy">You&apos;re on the list.</p>
            </>
          ) : (
            <>
              <h2 id="demo-title">
                Sign up to
                <br />
                request a demo
              </h2>
              <form className="modal-form" onSubmit={handleSubmit}>
                <div className="modal-field">
                  <label htmlFor="f-company">Company Name</label>
                  <input
                    id="f-company"
                    name="company"
                    type="text"
                    placeholder="Acme Corp"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    autoComplete="organization"
                  />
                </div>
                <div className="modal-field">
                  <label htmlFor="f-role">Role</label>
                  <input
                    id="f-role"
                    name="role"
                    type="text"
                    placeholder="Head of Strategy"
                    required
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    autoComplete="organization-title"
                  />
                </div>
                <div className="modal-row">
                  <div className="modal-field">
                    <label htmlFor="f-first">First name</label>
                    <input
                      id="f-first"
                      name="first"
                      type="text"
                      placeholder="Ada"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      autoComplete="given-name"
                    />
                  </div>
                  <div className="modal-field">
                    <label htmlFor="f-last">Last name</label>
                    <input
                      id="f-last"
                      name="last"
                      type="text"
                      placeholder="Lovelace"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      autoComplete="family-name"
                    />
                  </div>
                </div>
                <div className="modal-field">
                  <label htmlFor="f-email">Email address</label>
                  <input
                    id="f-email"
                    name="email"
                    type="email"
                    placeholder="ada@acme.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
                {errorMsg ? <p className="modal-error">{errorMsg}</p> : null}
                <button className="modal-submit" type="submit" disabled={submitting}>
                  {submitting ? "Submitting…" : "Request Demo"}
                </button>
              </form>
              <h3 className="modal-privacy">
                We respect your privacy and will not share your data.
              </h3>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * Landing CSS. Ported from Web/Unicron Landing/Unicron Landing.html with
 * the tweak-panel runtime stripped — Kyle's locked-in panel values are
 * baked directly into the rules (pane alpha/blur/radius/grain, button
 * alpha, arm offset/width/opacity, head/sub/eyebrow sizes, font choices).
 * ───────────────────────────────────────────────────────────────────── */
const LANDING_CSS = `
:root {
  --bg-hi:   #d4dadd;
  --bg-mid:  #b8c0c6;
  --bg-low:  #8d99a3;
  --bg-deep: #5e6c78;

  --ink:        #1a2229;
  --ink-strong: #0c1418;
  --ink-dim:    rgba(26, 34, 41, 0.62);
  --ink-faint:  rgba(26, 34, 41, 0.42);
  --ink-ghost:  rgba(26, 34, 41, 0.20);

  --teal:       #0e4a66;
  --teal-deep:  #0b3a52;
  --amber:      #8a4a0c;
}

html, body {
  height: 100%; width: 100%;
  overflow: hidden;
  color: var(--ink);
  font-family: 'JetBrains Mono', monospace;
  -webkit-font-smoothing: antialiased;
  background: var(--bg-mid);
}

/* Background image (layer 1) */
.bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  background:
    url("/landing/background.jpg") center/cover no-repeat,
    #b8c0c6;
}

/* Arm (layer 2). Anchored to the canvas core hex — the organism JS
   updates --organism-cx / --organism-cy on every resize so the fingertip
   tracks the core regardless of desktop/mobile reflow. */
.arm-anchor {
  position: fixed;
  left: var(--organism-cx, 68vw);
  top:  var(--organism-cy, 50vh);
  margin-left: -40px;
  margin-top: 16px;
  z-index: 1;
  pointer-events: none;
  width: 0; height: 0;
}
.arm-anchor img {
  position: absolute;
  display: block;
  width: 960px;
  height: 447px; /* DEBUG: force height in case naturalSize doesn't compute */
  transform: translate(-98.3%, -0.5%);
  transform-origin: 100% 0%;
  opacity: 0.85;
  /* DEBUG STRIPE — temporary so we can see WHERE the arm bbox lives */
  outline: 4px solid #ff0066;
  background: rgba(255, 0, 102, 0.18);
}
@media (max-width: 900px) {
  /* On mobile the JS still sets --organism-cx / --organism-cy; only the
     fingertip-to-anchor offsets + image scale change. */
  .arm-anchor {
    margin-left: -60px;
    margin-top: 32px;
  }
  .arm-anchor img { width: clamp(700px, 130vw, 1400px); }
}

/* Canvas */
#engine {
  position: fixed;
  inset: 0;
  width: 100%; height: 100%;
  z-index: 2;
  cursor: crosshair;
}

/* Demo modal */
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(8, 12, 18, 0.5);
  backdrop-filter: blur(14px) saturate(120%);
  -webkit-backdrop-filter: blur(14px) saturate(120%);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.35s ease;
}
.modal-backdrop.open { opacity: 1; pointer-events: auto; }
.modal {
  position: relative;
  width: 100%;
  max-width: 480px;
  border-radius: 28px;
  padding: 40px 44px 36px;
  background: rgba(20, 28, 36, 0.32);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(22px) saturate(125%);
  -webkit-backdrop-filter: blur(22px) saturate(125%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.18),
    0 30px 80px rgba(0, 0, 0, 0.45),
    0 4px 12px rgba(0, 0, 0, 0.25);
  color: #ffffff;
  isolation: isolate;
  transform: translateY(12px) scale(0.985);
  transition: transform 0.35s cubic-bezier(.2,.8,.2,1);
}
.modal-backdrop.open .modal { transform: translateY(0) scale(1); }
.modal::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  border-radius: inherit;
  opacity: 0.35;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.0' numOctaves='2' stitchTiles='stitch' seed='6'/><feColorMatrix type='matrix' values='0 0 0 0 0.96  0 0 0 0 0.98  0 0 0 0 1  0 0 0 1 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  background-size: 180px 180px;
}
.modal-close {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.78);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}
.modal-close:hover { background: rgba(255, 255, 255, 0.14); color: #ffffff; }
.modal h2 {
  font-family: 'Instrument Serif', serif;
  font-style: italic;
  font-weight: 400;
  font-size: 32px;
  line-height: 1.1;
  letter-spacing: -0.01em;
  color: #ffffff;
  margin: 0 0 24px;
}
.modal-form { display: flex; flex-direction: column; gap: 12px; }
.modal-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.modal-field { display: flex; flex-direction: column; gap: 6px; }
.modal-field label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.6);
}
.modal-field input {
  appearance: none;
  width: 100%;
  padding: 11px 14px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  color: #ffffff;
  font-family: 'Instrument Serif', serif;
  font-size: 17px;
  line-height: 1.2;
  outline: none;
  transition: border-color 0.2s ease, background 0.2s ease;
}
.modal-field input::placeholder { color: rgba(255, 255, 255, 0.35); }
.modal-field input:focus {
  border-color: rgba(255, 255, 255, 0.45);
  background: rgba(255, 255, 255, 0.12);
}
.modal-submit {
  margin-top: 10px;
  width: 100%;
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.85);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.96);
  color: #14202c;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.25s ease;
}
.modal-submit:hover:not(:disabled) {
  background: #ffffff;
  transform: translateY(-1px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.18);
}
.modal-submit:disabled { opacity: 0.6; cursor: progress; }
.modal-error {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  line-height: 1.4;
  letter-spacing: 0.02em;
  color: #ffb3a8;
  margin: 4px 2px 0;
}
.modal-privacy {
  font-family: 'JetBrains Mono', monospace;
  font-style: normal;
  font-weight: 400;
  font-size: 10px;
  letter-spacing: 0.04em;
  text-align: center;
  color: rgba(255, 255, 255, 0.55);
  margin: 16px 0 0;
}
@media (max-width: 520px) {
  .modal { padding: 32px 24px 28px; }
  .modal h2 { font-size: 26px; }
  .modal-row { grid-template-columns: 1fr; }
}

/* Left glass pane */
.hero-pane {
  position: fixed;
  inset: 0 auto 0 0;
  width: 33.333vw;
  min-width: 360px;
  max-width: 600px;
  z-index: 4;
  padding: 56px 64px;
  display: flex;
  flex-direction: column;
  border-radius: 0 38px 38px 0;
  background: rgba(20, 28, 36, 0.20);
  backdrop-filter: blur(3.5px) saturate(115%);
  -webkit-backdrop-filter: blur(3.5px) saturate(115%);
  border-right: 1px solid rgba(255, 255, 255, 0.22);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.30),
    inset 1px 0 0 rgba(255, 255, 255, 0.12),
    20px 0 60px -10px rgba(20, 28, 36, 0.22),
    6px 0 18px -4px rgba(20, 28, 36, 0.12);
  isolation: isolate;
  overflow: hidden;
}
.hero-pane::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  border-radius: inherit;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 24%),
    linear-gradient(90deg,  rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 14%);
}
.hero-pane::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  border-radius: inherit;
  opacity: 0.46;
  mix-blend-mode: overlay;
  background-image:
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch' seed='9'/><feColorMatrix type='matrix' values='0 0 0 0 0.96  0 0 0 0 0.98  0 0 0 0 1  0 0 0 1.1 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"),
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.6' numOctaves='2' stitchTiles='stitch' seed='4'/><feColorMatrix type='matrix' values='0 0 0 0 0.95  0 0 0 0 0.97  0 0 0 0 1  0 0 0 0.85 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  background-size: 160px 160px, 240px 240px;
}
.hero-pane > .glass-grit {
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  border-radius: inherit;
  opacity: 0.18;
  mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='2' stitchTiles='stitch' seed='17'/><feColorMatrix type='matrix' values='0 0 0 0 0.15  0 0 0 0 0.18  0 0 0 0 0.22  0 0 0 0.9 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  background-size: 200px 200px;
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .hero-pane { background: rgba(180, 192, 204, 0.55); }
}

/* Pane contents */
.pane-brand {
  display: flex;
  align-items: center;
}
/* Combined hex-mark + UNICRON SYSTEMS wordmark lockup (378×138, ~2.74:1).
   Height-driven so the wordmark height matches the mark; width auto-fits. */
.pane-brand .mark {
  height: 42px;
  width: auto;
  flex: 0 0 auto;
  display: block;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.25));
}

.pane-spacer { flex: 1; }

.pane-hero {
  display: flex;
  flex-direction: column;
  gap: 28px;
}
.pane-hero .eyebrow {
  font-family: 'Playfair Display', serif;
  font-style: italic;
  font-weight: 400;
  font-size: 22px;
  line-height: 1.25;
  letter-spacing: 0.005em;
  text-transform: none;
  color: rgba(255, 255, 255, 0.86);
  margin: 0 0 -24px 0;
}
.pane-hero .head {
  font-family: 'Syne', sans-serif;
  font-style: normal;
  font-weight: 400;
  font-size: 54px;
  line-height: 0.95;
  letter-spacing: -0.022em;
  color: #ffffff;
  text-shadow: 0 1px 24px rgba(20, 28, 36, 0.25);
  margin: 0;
}
.pane-hero .sub {
  font-family: 'Outfit', sans-serif;
  font-style: normal;
  font-weight: 400;
  font-size: 16px;
  line-height: 1.25;
  letter-spacing: 0.005em;
  color: rgba(255, 255, 255, 0.86);
  margin: -16px 0 12px 0;
}
.pane-hero .period {
  color: #ffffff;
  font-style: normal;
  opacity: 0.92;
}
.pane-rule {
  width: 56px;
  height: 1px;
  background: rgba(255, 255, 255, 0.45);
}

.access {
  display: inline-flex;
  align-items: center;
  gap: 14px;
  align-self: flex-start;
  padding: 16px 28px;
  border: 1px solid rgba(20, 28, 36, 0.14);
  border-radius: 999px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #ffffff;
  text-decoration: none;
  background: rgba(20, 28, 36, 0.18);
  transition: all 0.35s ease;
  cursor: pointer;
}
.access:hover {
  background: rgba(20, 28, 36, 0.28);
  border-color: rgba(20, 28, 36, 0.30);
  transform: translateY(-1px);
}
.access .arrow {
  width: 11px; height: 11px;
  position: relative;
  transition: transform 0.4s ease;
}
.access .arrow::before {
  content: ''; position: absolute;
  top: 50%; left: 0; width: 100%; height: 1px;
  background: #ffffff;
}
.access .arrow::after {
  content: ''; position: absolute;
  top: 50%; right: 0; width: 5px; height: 5px;
  border-top: 1px solid #ffffff;
  border-right: 1px solid #ffffff;
  transform: translateY(-50%) rotate(45deg);
}
.access:hover .arrow { transform: translateX(4px); }

/* Live signal feed */
.feed {
  position: fixed;
  bottom: 0;
  right: 0;
  z-index: 3;
  width: 270px;
  height: 86px;
  overflow: hidden;
  padding: 6px 14px 10px 14px;
  border-left: 1px solid var(--ink-ghost);
  font-family: 'JetBrains Mono', monospace;
  -webkit-mask-image: linear-gradient(to top, black 50%, rgba(0,0,0,0.3) 92%, transparent 100%);
          mask-image: linear-gradient(to top, black 50%, rgba(0,0,0,0.3) 92%, transparent 100%);
}
.feed .feed-label {
  position: absolute;
  top: -4px;
  right: 8px;
  padding: 0 6px;
  font-size: 7.5px;
  letter-spacing: 0.32em;
  color: rgba(244, 248, 252, 0.7);
  text-shadow: 0 1px 2px rgba(20, 28, 36, 0.45);
  text-transform: uppercase;
}
.feed-inner {
  position: absolute;
  left: 14px;
  right: 14px;
  bottom: 8px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.feed-line {
  font-size: 9px;
  letter-spacing: 0.04em;
  color: rgba(244, 248, 252, 0.88);
  text-shadow: 0 1px 2px rgba(20, 28, 36, 0.45);
  white-space: nowrap;
  overflow: hidden;
  transition: opacity 0.6s ease;
  line-height: 1.2;
}
.feed-line .sym  { color: rgba(244, 248, 252, 0.55); margin-right: 7px; }
.feed-line .hex  { color: #ffffff; }
.feed-line .dim  { color: rgba(244, 248, 252, 0.55); }
.feed-line .amb  { color: #ffe4b8; }
.feed-line .ink  { color: #ffffff; }

@media (max-width: 900px) {
  .hero-pane {
    width: 100vw;
    max-width: none;
    min-width: 0;
    inset: 0 0 auto 0;
    height: auto;
    padding: 32px 28px 40px;
    border-radius: 0 0 28px 28px;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.45),
      inset 0 -1px 0 rgba(20, 28, 36, 0.10),
      0 20px 50px -10px rgba(20, 28, 36, 0.32);
    border-right: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.18);
  }
  .pane-spacer { display: none; }
  /* Padding between the brand lockup and the eyebrow on mobile — the
     desktop layout relies on pane-spacer's flex:1 for this gap; with the
     spacer hidden on mobile, give pane-hero an explicit margin-top. */
  .pane-hero { gap: 20px; margin-top: 32px; }
  .pane-hero .head { font-size: clamp(38px, 9vw, 60px); }
  .pane-hero .sub { font-size: clamp(15px, 3.5vw, 20px); }
  .pane-hero .eyebrow { font-size: clamp(16px, 4vw, 22px); }
  .access { padding: 14px 22px; font-size: 10px; }
  .feed { bottom: 0; right: 0; width: 220px; height: 68px; padding: 4px 10px 8px 10px; }
  .feed .feed-label { font-size: 7px; }
  .feed-line { font-size: 8.5px; }
}

.fade-in { opacity: 0; animation: fadeIn 1.4s ease-out forwards; }
.fade-in.d1 { animation-delay: 1.4s; }
.fade-in.d2 { animation-delay: 2.0s; }
.fade-in.d3 { animation-delay: 2.5s; }
.fade-in.d4 { animation-delay: 3.0s; }
@keyframes fadeIn { to { opacity: 1; } }
`;
