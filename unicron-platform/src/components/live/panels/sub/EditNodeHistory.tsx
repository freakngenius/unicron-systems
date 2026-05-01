import { useState } from 'react';
import { enricherVersions, type EditVersion } from '../../../../data/mocks';

type Props = {
  onRevert?: (instruction: string) => void;
};

export function EditNodeHistory({ onRevert }: Props) {
  const [openDiff, setOpenDiff] = useState<string | null>(null);

  return (
    <div>
      {enricherVersions.map((v) => (
        <Row
          key={v.id}
          version={v}
          diffOpen={openDiff === v.id}
          onToggleDiff={() => setOpenDiff(openDiff === v.id ? null : v.id)}
          onRevert={onRevert}
        />
      ))}
    </div>
  );
}

function Row({
  version,
  diffOpen,
  onToggleDiff,
  onRevert,
}: {
  version: EditVersion;
  diffOpen: boolean;
  onToggleDiff: () => void;
  onRevert?: (instruction: string) => void;
}) {
  const handleRevert = () => {
    if (!onRevert) return;
    // The "previous instruction" is the diffPlus value of an older version
    // (the line that was added when that older version landed).
    onRevert(version.diffPlus || version.diffMinus);
  };

  return (
    <div className="border-b border-border-default py-4">
      <div className="flex items-baseline justify-between gap-4">
        <div className="mono text-[12px] text-text-primary">{version.label}</div>
        <div className="mono text-[11px] text-text-secondary">{version.when}</div>
      </div>
      <div className="mono text-[11px] text-text-secondary mt-1.5 ml-0.5">
        {version.byline} · <span className="text-text-primary/80">{version.message}</span>
      </div>

      <div className="flex items-center gap-3 mt-3">
        <button
          type="button"
          onClick={onToggleDiff}
          className="mono text-[11px] text-text-primary/60 hover:text-text-primary hover:underline transition-colors"
        >
          [ DIFF ]
        </button>
        {version.current ? (
          <span className="mono text-[11px] tracking-[0.18em] text-accent-gold uppercase">
            active
          </span>
        ) : (
          <button
            type="button"
            onClick={handleRevert}
            className="border border-border-default text-text-primary mono text-[11px] tracking-[0.12em] uppercase py-1 px-2.5 rounded-md hover:border-border-hover transition-colors"
          >
            REVERT
          </button>
        )}
      </div>

      {diffOpen && (
        <div className="mt-3 rounded-md overflow-hidden">
          {version.diffMinus && (
            <div className="bg-red-500/10 text-red-300/80 mono text-[12px] p-3 leading-[1.55]">
              <span className="text-red-300/60 mr-2">-</span>
              {version.diffMinus}
            </div>
          )}
          {version.diffPlus && (
            <div className="bg-green-500/10 text-green-300/80 mono text-[12px] p-3 leading-[1.55]">
              <span className="text-green-300/60 mr-2">+</span>
              {version.diffPlus}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
