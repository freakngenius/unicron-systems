"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./page.module.css";

export default function Page() {
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);

  // Ping-pong playback: forward → reverse → forward, instantly looping.
  // Source video is served untouched (no re-encode generation loss).
  // Native play() handles forward (smooth); rAF scrubs the reverse half.
  // Direction flips *before* the video's native end so there's no pause
  // in the "ended" state.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let rafId = 0;
    let lastT = 0;
    let direction: 1 | -1 = 1;
    let cancelled = false;
    const END_MARGIN = 0.08; // seconds — flip before native end
    const START_MARGIN = 0.02;

    const tick = (now: number) => {
      if (cancelled) return;
      const dt = (now - lastT) / 1000;
      lastT = now;

      if (direction === 1) {
        // Forward — native play is running. Flip just before the end.
        if (video.duration && video.currentTime >= video.duration - END_MARGIN) {
          video.pause();
          direction = -1;
        }
      } else {
        // Reverse — scrub backward.
        const next = video.currentTime - dt;
        if (next <= START_MARGIN) {
          video.currentTime = 0;
          direction = 1;
          video.play().catch(() => {});
        } else {
          video.currentTime = next;
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    // Safety net: if the video ends before rAF catches it, kick into reverse.
    const onEnded = () => {
      if (direction === 1) {
        direction = -1;
        if (video.duration) {
          video.currentTime = video.duration - 0.01;
        }
      }
    };

    const start = () => {
      if (cancelled) return;
      video.play().catch(() => {});
      lastT = performance.now();
      rafId = requestAnimationFrame(tick);
    };

    video.addEventListener("ended", onEnded);
    if (video.readyState >= 2) start();
    else video.addEventListener("loadeddata", start, { once: true });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("loadeddata", start);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Something went wrong.");
        setStatus("error");
        return;
      }

      setStatus("success");
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  return (
    <main className={styles.background}>
      <video
        ref={videoRef}
        className={styles.video}
        src="/unicron_background.mp4"
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
      />
      <div className={styles.content}>
        <h1 className={styles.title}>UNICRON SYSTEMS</h1>
        <h2 className={styles.subtitle}>Under Construction</h2>
        <p className={styles.description}>
          Follow along and learn how we&apos;re building a fully agentic
          business. We will share our process and learnings.
        </p>
        <button className={styles.signupBtn} onClick={() => setShowModal(true)}>
          Sign Up for Updates
        </button>
        <p className={styles.privacy}>
          We respect your privacy and will not share your data.
        </p>
      </div>

      {showModal && (
        <div className={styles.overlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button
              className={styles.closeBtn}
              onClick={() => setShowModal(false)}
              aria-label="Close"
            >
              &times;
            </button>

            {status === "success" ? (
              <div className={styles.successMsg}>
                <h3>You&apos;re in!</h3>
                <p>Thanks for signing up. We&apos;ll be in touch.</p>
              </div>
            ) : (
              <>
                <h3 className={styles.modalTitle}>Stay in the Loop</h3>
                <p className={styles.modalDesc}>
                  Get updates on our journey building with AI agents.
                </p>
                <form onSubmit={handleSubmit} className={styles.form}>
                  <input
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className={styles.input}
                  />
                  <input
                    type="email"
                    placeholder="Your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className={styles.input}
                  />
                  {errorMsg && <p className={styles.errorMsg}>{errorMsg}</p>}
                  <button
                    type="submit"
                    className={styles.submitBtn}
                    disabled={status === "loading"}
                  >
                    {status === "loading" ? "Signing up..." : "Sign Up"}
                  </button>
                </form>
                <p className={styles.modalPrivacy}>
                  We respect your privacy and will not share your data.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
