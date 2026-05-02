# Karpathy on Code Agents, AutoResearch, and the Loopy Era of AI
Summary + Unicron Systems applications

## Core Thesis
The constraint on individual output is no longer typing speed, compute, or access — it's "skill issue." Since ~December 2025, the bottleneck has shifted to *how well you orchestrate agents*: your ability to remove yourself from the loop, parallelize work, and maximize token throughput across multiple agent sessions. Karpathy hasn't typed a line of code since December.

## Key Takeaways

1. **Skill issue = new mental model.** When things don't work, assume it's your instructions, memory setup, or orchestration — not the model. The capability is there; you haven't strung it together right.

2. **Token throughput is the new GPU utilization.** If your Claude/Codex subscription isn't maxed out, you're the bottleneck. Goal: run so many parallel agents you feel compute-bound again.

3. **Macro actions over micro actions.** Don't prompt line-by-line. Delegate entire non-interfering functionalities to separate agents (Peter Steinberg model: 10 repos checked out, multiple Codex agents, 20-min runs).

4. **"Claws" are the next layer up from agents.** Persistent, looping, sandboxed entities with sophisticated memory (not just context compaction). Peter's ClaudeApp innovated on: personality (teammate feel), calibrated sycophancy, memory system, single WhatsApp portal to all automation.

5. **Dobby-style home automation is near-free.** Karpathy's Claude reverse-engineered Sonos, lights, HVAC, pool, and security cameras over his LAN via natural language. Replaced six apps. He says this will be table-stakes in 1–3 years — no vibe coding required.

6. **The customer isn't the human anymore.** It's the agent acting on behalf of the human. App UIs should arguably not exist — just API endpoints that agents glue together.

7. **Auto research = remove yourself as the loop.** Set objective + metric + boundaries, hit go. Karpathy's NanoChat auto-tuner found hyperparam improvements he'd missed after 20 years of hand-tuning. Key constraint: only works where metrics are objectively verifiable.

8. **Meta-optimization is the recursive step.** Once an org is described in markdown (roles, stand-up cadence, risk tolerance), you can run different `program.md` variants against the same hardware and let the model write better ones. Research orgs become code.

9. **Untrusted-worker auto-research.** If verification is cheap but search is expensive (LLM training, protein folding), you can run Folding@Home-style distributed auto-research across an untrusted internet pool. Frontier Labs may lose to swarms.

10. **Monoculture vs. speciation.** Labs are still pushing one big model for everything. Karpathy expects speciation (domain-specialized models) but the "science of manipulating brains" (fine-tuning without capability loss, continual learning) isn't developed yet. Context windows are still the main customization primitive.

11. **Jaggedness is real and persistent.** Models are PhD-systems-programmer + 10-year-old simultaneously. Verifiable domains improve fast (code, math). Unverifiable domains (jokes, nuance, "when to ask clarifying questions") stay frozen. Don't assume intelligence transfers across domains just because benchmarks improve.

12. **Digital will get unhobbled 100x before physical moves much.** Bits are a million times easier than atoms. Expect massive refactoring in digital professions first; robotics lags (self-driving took a decade+ and killed most startups).

13. **Jevons paradox on software.** Cheaper software = more demand for software. Engineer demand is rising, not falling, at least locally.

14. **Open source will stay ~6–8 months behind closed frontier — and that's healthy.** Analogous to Linux behind Windows/MacOS. Most consumer use cases will be served by open models running locally; frontier demand concentrates on "Nobel Prize-level" work.

15. **The frontier-lab alignment problem for individuals.** Being inside gives you visibility but costs independence; being outside preserves judgment but risks drift. Karpathy's answer: oscillate.

16. **Education is for agents now.** Don't write HTML docs for humans — write markdown for agents, who become the router that explains to any human in their language at their level. Skills ≈ scripted curricula for agents to teach with.

## Key Insights

- **Personality matters more than feature coverage.** Claude feels like a teammate; Codex is dry. The dial on sycophancy — praising proportional to actual quality of ideas — creates an earned-reward loop that shapes user behavior.
- **Security is the main block on going full Dobby.** Karpathy won't give full access to email/calendar/digital life yet. Privacy + new-tool risk = caution warranted.
- **Interfaces between physical and digital = huge TAM.** Sensors (lab equipment, cameras, paid-training-data pipelines) and actuators are where the next wave of big opportunity sits — bigger market than pure digital, but harder.
- **"Information markets" are underbuilt.** Prediction markets have autonomous activity but no bounty system for agents to purchase fresh data (e.g. "$10 for a photo from Tehran right now"). The agentic web lacks these primitives.
- **Societal actuator inversion.** Long-term, humans may become sensors and actuators for the machine, not the other way around (references Daemon by Daniel Suarez).
- **Flops > dollars, eventually.** In a compute-constrained world, the question becomes how many FLOPs you command, not how much money.

## Applications to Unicron Systems

**Direct hits on current sprint:**

1. **Stop being the bottleneck in discovery.** You and Keenan are running discovery calls by hand. That's right for validating pain (unverifiable, human-judgment territory). But the *synthesis* layer — extracting workflows, choke points, dollar-quantified pain from transcripts across Kyle/Keenan/Curtis/Jack — is a perfect auto-research loop. Objective metric: coverage of the discovery template + pain quantification. Delegate it, don't do it.

2. **"Computer is the Engine" = literally this thesis.** The contest judging criterion ("Computer is the Engine, not a helper") is the Karpathy thesis in PR form. Your pitch should quantify *token throughput*, *parallel agent count*, *macro-actions per day*. That's the wild-economics story — 2 humans × N parallel claws vs. a 50-person team doing serial work.

3. **Paperclip abandonment was correct, but the next step isn't Notion-Spaces-forever.** Karpathy's "claw" concept (persistent, looping, sandboxed, sophisticated memory) is what you're rebuilding toward. Your "@computer -lead" Slack pattern is step one. The next layer: persistent agents that keep running when you close Slack, with real memory systems beyond context compaction.

4. **`program.md` thinking applied to your CEO/CMO/CTO/COO setup.** The Notion Memory pages you've scaffolded ARE a `program.md`. Make them tunable. Version them. A/B them. Let the system propose revisions to its own role definitions after each sprint. This is your meta-loop and a compelling demo artifact.

5. **Generator-Verifier gates = the verifiable-metric trick.** Karpathy says auto-research only works where evaluation is objective. Your Generator-Verifier architecture is already the right shape — double down on making the verifier criteria machine-checkable (not "does this read well" but "does this hit the 5 criteria with evidence"). Anywhere you can't write a verifier, the loop will spin uselessly.

6. **Vertical selection criterion: how verifiable is the core metric?** Re-score your top candidates through this lens:
   - Public Adjuster Intelligence → settlement $ recovered is objectively verifiable. Strong fit for auto-loop.
   - Property Intelligence → data completeness/accuracy benchmarkable. Strong fit.
   - Mold Remediation OS → softer workflow metrics, harder to close the loop autonomously.
   This is a new tiebreaker dimension that favors PA Intelligence.

7. **Traction scoreboard = maxed token throughput.** For the contest demo: don't show "look what Claude did once." Show a dashboard of agent-hours run, artifacts produced, humans-in-the-loop percentage trending down, revenue-per-human-hour trending up. That's the "Wild Economics" proof.

8. **Dobby-style reverse engineering as a discovery accelerant.** For whichever vertical you pick, have an agent reverse-engineer the existing tool stack in that industry (as Dobby did with Sonos). Public adjusters use Xactimate, Symbility, etc. — agent maps APIs, identifies gluable surfaces. Directly informs differentiation.

9. **Warning on the "precious IP" question.** Karpathy's joke/code jaggedness point has an operational implication: whatever you build, the moat isn't the model — it's the `program.md`, the verifier criteria, the memory architecture, and the closed-loop data flywheel. Those are defensible. A fine-tuned model is not. Adjust your "submit vs. keep precious" criteria accordingly — if your moat is orchestration IP and data, the contest submission is relatively safer.

10. **Open-source-behind-by-6-months is your cost/infra plan.** Build so switching between Claude/Codex/open models is trivial. In 6 months, what's frontier today runs locally or on cheap inference, collapsing your unit economics in your favor. This is the real "Wild Economics" lever post-contest.

11. **Education-to-agents reframe for your sales motion.** When you sell the eventual product, you're not writing user docs — you're writing agent-readable skills so a buyer's agent can onboard itself into your system. Makes integration velocity a differentiator.

## Concrete Next Steps

- Add a "token throughput + human-in-loop %" metric to your traction dashboard. Start tracking today.
- Re-score top 3 verticals against "objective-metric-density" as a new criterion. Takes 30 min with the CEO agent.
- Build a `program.md` versioning system in Notion — one page per agent, diff-tracked, with a changelog of what improved when you changed role definitions.
- Delegate discovery-call synthesis to an auto-loop (Computer prompt: ingest all transcripts from /discovery/, extract pain themes + $ quantification + willingness-to-co-build signal, score on template coverage, iterate until coverage ≥ 90%).
- Write one skill per vertical that scripts the reverse-engineering-the-incumbent-stack research (Karpathy's Dobby pattern applied to industry tooling).
