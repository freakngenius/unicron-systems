// Conversational onboarding Architect tests.
//
// SPEC: Company Docs/Metacron/SPEC - Conversational Architect.md
//
// Mocks `postDecomposition` so each test can script the per-turn responses.
// Renders with the same provider stack the prior archived test used.

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { ArchitectThinking } from './ArchitectThinking';
import type { ApproveMeta } from './ArchitectThinking';
import { SettingsProvider } from '../SettingsContext';
import { SystemProvider } from '../../context/SystemContext';
import type { SystemConfig } from '../../context/SystemContext';
import type {
  DecompositionResponse,
  DecompositionArchitecture,
} from '../../lib/contracts/architect';

// The Architect client is the I/O seam — mock it so the component can be
// driven turn-by-turn without touching the network.
const postDecompositionMock = vi.fn();

vi.mock('../../lib/architectClient', () => ({
  postDecomposition: (...args: unknown[]) => postDecompositionMock(...args),
}));

// Quiet the SettingsContext hydration roundtrip — its loadRemote pings
// Supabase and the test environment has no real client.
vi.mock('../../lib/settings', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../lib/settings');
  return {
    ...actual,
    loadRemote: vi.fn(async () => null),
    saveRemote: vi.fn(async () => undefined),
  };
});

// listCustomerOrgs is queried up-front for slug uniqueness — return empty.
vi.mock('../../lib/customersClient', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '../../lib/customersClient',
  );
  return {
    ...actual,
    listCustomerOrgs: vi.fn(async () => []),
  };
});

// JSDOM doesn't implement Canvas 2D — stub the SimEngine the same way
// Visualizer.test.tsx does so the component tree renders without crashing.
vi.mock('../visualizer/simEngine', () => ({
  SimEngine: class {
    constructor() {}
    updateConfig() {}
    setReducedMotion() {}
    pulseAgent() {}
    destroy() {}
  },
}));

const arch1: DecompositionArchitecture = {
  buyer: 'public adjusters',
  buying_signal: 'storm damage events',
  data_sources_proposed: [
    { type: 'noaa-storm-reports', jurisdictions: ['FL', 'TX'], expected_daily_volume: 12 },
  ],
  data_sources_rejected: [],
  layer_2_watchers: [
    { source_type: 'noaa-storm-reports', instruction: 'poll daily' },
  ],
  layer_3_agents: [{ role: 'qualifier', instruction: 'filter by category' }],
  layer_4_agents: [{ role: 'ranker', instruction: 'rank by severity' }],
  estimates: {
    daily_qualified_volume: 4,
    cost_per_lead_usd: 0.08,
    architecture_confidence: 'medium',
  },
  open_questions: [
    'Should we drop Florida from coverage?',
    'What is the minimum storm category to qualify?',
  ],
  business_summary: {
    lead_type: 'public adjusters',
    business_area: 'insurance',
    problem_solved: 'find storm-damage homes quickly',
    what_they_get: 'qualified leads with damage type',
  },
};

const arch2: DecompositionArchitecture = {
  ...arch1,
  buyer: 'public adjusters — FL dropped',
  data_sources_proposed: [
    { type: 'noaa-storm-reports', jurisdictions: ['TX'], expected_daily_volume: 8 },
  ],
  estimates: { ...arch1.estimates, daily_qualified_volume: 3 },
  open_questions: ['What is the minimum storm category to qualify?'],
};

const arch3: DecompositionArchitecture = {
  ...arch2,
  buyer: 'public adjusters — FL dropped, cat-3+',
  estimates: { ...arch2.estimates, daily_qualified_volume: 2 },
  open_questions: [],
};

function makeResponse(arch: DecompositionArchitecture, sessionId: string): DecompositionResponse {
  return {
    sessionId,
    lines: [{ index: 0, text: `BUYER         ${arch.buyer}`, kind: 'buyer' }],
    recommendedConfig: {
      status: 'configured',
      buyerPain: 'pain',
      dataSources: [],
      agents: [],
    } as unknown as SystemConfig,
    confidence: 0.6,
    costUsd: 0.01,
    architecture: arch,
  };
}

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <SettingsProvider>
      <SystemProvider>{ui}</SystemProvider>
    </SettingsProvider>,
  );
}

beforeEach(() => {
  postDecompositionMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('<ArchitectThinking /> — conversation loop', () => {
  it('shows the thinking indicator while postDecomposition is in flight and clears it on response', async () => {
    // Hold the promise so we can observe the in-flight state explicitly.
    let resolveFirst!: (r: DecompositionResponse) => void;
    postDecompositionMock.mockImplementationOnce(
      () => new Promise<DecompositionResponse>((r) => { resolveFirst = r; }),
    );

    renderWithProviders(
      <ArchitectThinking buyerPain="storm damage adjusters" onApprove={vi.fn()} />,
    );

    // While the call is in flight, the operator's buyer-pain message renders
    // immediately AND the "Architect is thinking" indicator is visible.
    await screen.findByText(/storm damage adjusters/);
    expect(screen.getByTestId('architect-thinking-indicator')).toBeInTheDocument();
    expect(screen.queryByTestId('architect-message')).toBeNull();

    // Land the response — thinking indicator disappears, architect turn appears.
    resolveFirst(makeResponse(arch1, 'sess-1'));
    await screen.findByTestId('architect-message');
    expect(screen.queryByTestId('architect-thinking-indicator')).toBeNull();
  });

  it('resets the reveal cursor on each turn arrival so per-turn animation starts from 0', async () => {
    // Two turns; the first must finish revealing before turn-2 fires. After
    // turn-2 lands, the latest-turn message renders with cursor=0 (only the
    // pulsing reveal cursor visible, no architecture lines yet).
    postDecompositionMock
      .mockResolvedValueOnce(makeResponse(arch1, 'sess-1'))
      .mockResolvedValueOnce(makeResponse(arch2, 'sess-2'));

    renderWithProviders(
      <ArchitectThinking buyerPain="storm damage adjusters" onApprove={vi.fn()} />,
    );

    // Wait for turn-1 to render fully (BUYER line visible).
    await screen.findByText(/BUYER\s+public adjusters$/m);

    // Send turn 2.
    fireEvent.change(screen.getByTestId('architect-composer'), {
      target: { value: 'drop Florida' },
    });
    fireEvent.click(screen.getByTestId('architect-composer-send'));

    // After turn-2 lands, the latest architect message exists but its reveal
    // cursor has been reset — the new BUYER text ("FL dropped") is NOT yet in
    // the DOM in the latest message. The reveal animation will pull it in
    // over time.
    await waitFor(
      () => expect(screen.getAllByTestId('architect-message')).toHaveLength(2),
      { timeout: 4000 },
    );
    const latest = screen.getAllByTestId('architect-message')[1];
    // The animation interval is 60ms; immediately after the turn lands the
    // cursor is 0 → no architecture lines from turn-2 are rendered yet.
    expect(latest.textContent ?? '').not.toMatch(/public adjusters — FL dropped/);
  });

  it('appends operator + architect messages to the thread on each turn', async () => {
    postDecompositionMock
      .mockResolvedValueOnce(makeResponse(arch1, 'sess-1'))
      .mockResolvedValueOnce(makeResponse(arch2, 'sess-2'));

    renderWithProviders(
      <ArchitectThinking buyerPain="storm damage adjusters" onApprove={vi.fn()} />,
    );

    // Turn 0 is the buyerPain operator message; turn 1 is the first architect
    // response that auto-fires on mount.
    await screen.findByText(/BUYER\s+public adjusters$/m);
    const archMessages1 = await screen.findAllByTestId('architect-message');
    expect(archMessages1).toHaveLength(1);

    // Send an operator turn.
    const textarea = screen.getByTestId('architect-composer');
    fireEvent.change(textarea, { target: { value: 'drop Florida' } });
    fireEvent.click(screen.getByTestId('architect-composer-send'));

    await screen.findByText('drop Florida');
    await waitFor(
      () => expect(screen.getAllByTestId('architect-message')).toHaveLength(2),
      { timeout: 4000 },
    );

    // Two operator messages now (buyerPain + composer send) + two architect msgs.
    const operators = screen.getAllByTestId('operator-message');
    expect(operators).toHaveLength(2);
    expect(operators[0]).toHaveTextContent('storm damage adjusters');
    expect(operators[1]).toHaveTextContent('drop Florida');
  });

  it('postDecomposition is called with accumulated constraints on turn 2+', async () => {
    postDecompositionMock
      .mockResolvedValueOnce(makeResponse(arch1, 'sess-1'))
      .mockResolvedValueOnce(makeResponse(arch2, 'sess-2'))
      .mockResolvedValueOnce(makeResponse(arch3, 'sess-3'));

    renderWithProviders(
      <ArchitectThinking buyerPain="storm damage adjusters" onApprove={vi.fn()} />,
    );

    await waitFor(() => expect(postDecompositionMock).toHaveBeenCalledTimes(1));
    expect(postDecompositionMock.mock.calls[0][0]).toMatchObject({
      buyerPain: 'storm damage adjusters',
      constraints: [],
    });

    fireEvent.change(screen.getByTestId('architect-composer'), {
      target: { value: 'drop Florida' },
    });
    fireEvent.click(screen.getByTestId('architect-composer-send'));
    await waitFor(() => expect(postDecompositionMock).toHaveBeenCalledTimes(2));
    expect(postDecompositionMock.mock.calls[1][0]).toMatchObject({
      buyerPain: 'storm damage adjusters',
      constraints: ['drop Florida'],
    });

    // Wait for the second architect turn to land before sending the third.
    await waitFor(() =>
      expect(screen.getAllByTestId('architect-message')).toHaveLength(2),
    );

    fireEvent.change(screen.getByTestId('architect-composer'), {
      target: { value: 'minimum category 3' },
    });
    fireEvent.click(screen.getByTestId('architect-composer-send'));
    await waitFor(() => expect(postDecompositionMock).toHaveBeenCalledTimes(3));
    expect(postDecompositionMock.mock.calls[2][0]).toMatchObject({
      buyerPain: 'storm damage adjusters',
      constraints: ['drop Florida', 'minimum category 3'],
    });
  });

  it('clicking an open question seeds the composer with a Re: reference', async () => {
    postDecompositionMock.mockResolvedValueOnce(makeResponse(arch1, 'sess-1'));

    renderWithProviders(
      <ArchitectThinking buyerPain="storm damage adjusters" onApprove={vi.fn()} />,
    );

    const latest = await screen.findByTestId('architect-message');
    const questions = await within(latest).findAllByTestId('architect-open-question');
    expect(questions).toHaveLength(2);

    fireEvent.click(questions[0]);

    const textarea = screen.getByTestId('architect-composer') as HTMLTextAreaElement;
    expect(textarea.value).toMatch(/^Re: Should we drop Florida from coverage — /);
  });

  it('a failed turn is non-destructive: prior turns survive, composer re-enables', async () => {
    postDecompositionMock
      .mockResolvedValueOnce(makeResponse(arch1, 'sess-1'))
      .mockRejectedValueOnce(new Error('upstream 503'));

    renderWithProviders(
      <ArchitectThinking buyerPain="storm damage adjusters" onApprove={vi.fn()} />,
    );

    await screen.findByTestId('architect-message');

    fireEvent.change(screen.getByTestId('architect-composer'), {
      target: { value: 'drop Florida' },
    });
    fireEvent.click(screen.getByTestId('architect-composer-send'));

    await screen.findByTestId('architect-error-message');

    // Prior architect turn still present.
    expect(screen.getAllByTestId('architect-message')).toHaveLength(1);
    // Composer re-enabled for retry.
    const textarea = screen.getByTestId('architect-composer') as HTMLTextAreaElement;
    expect(textarea).not.toBeDisabled();
  });

  it('Approve & Deploy carries the latest turn`s session_id through ApproveMeta', async () => {
    postDecompositionMock
      .mockResolvedValueOnce(makeResponse(arch1, 'sess-first'))
      .mockResolvedValueOnce(makeResponse(arch2, 'sess-latest'));

    const onApprove = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <ArchitectThinking buyerPain="storm damage adjusters" onApprove={onApprove} />,
    );

    await screen.findByTestId('architect-message');

    // Advance to turn 2 so the latest session_id is `sess-latest`.
    fireEvent.change(screen.getByTestId('architect-composer'), {
      target: { value: 'drop Florida' },
    });
    fireEvent.click(screen.getByTestId('architect-composer-send'));
    await waitFor(() =>
      expect(screen.getAllByTestId('architect-message')).toHaveLength(2),
    );

    const approveBtn = await screen.findByTestId('architect-approve-button');
    await waitFor(() => expect(approveBtn).not.toBeDisabled(), { timeout: 4000 });
    fireEvent.click(approveBtn);

    await screen.findByTestId('approve-deploy-modal');
    fireEvent.change(screen.getByTestId('approve-deploy-slug-input'), {
      target: { value: 'storm-damage-pa' },
    });
    fireEvent.click(screen.getByTestId('approve-deploy-confirm'));

    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    const [, meta] = onApprove.mock.calls[0] as unknown as [SystemConfig, ApproveMeta];
    expect(meta.session_id).toBe('sess-latest');
    expect(meta.architecture.buyer).toBe('public adjusters — FL dropped');
  }, 15_000);
});
