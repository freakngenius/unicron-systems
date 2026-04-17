"use client";

import { useState } from "react";
import styles from "./page.module.css";

export default function Page() {
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

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
        className={styles.video}
        src="/unicron_background.mp4"
        autoPlay
        loop
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
