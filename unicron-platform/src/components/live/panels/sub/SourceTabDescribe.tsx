import { useState } from 'react';
import { FieldLabel } from './sourceFields';

export function SourceTabDescribe() {
  const [desc, setDesc] = useState(
    "The Sacramento County recorder's office posts daily filings as a PDF on this page: https://recorder.saccounty.gov/dailyfiles. I want to extract new property transactions over $1M.",
  );

  return (
    <div>
      <FieldLabel label="DESCRIPTION">
        <textarea
          rows={8}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          className="w-full bg-bg-input border border-border-default rounded-md px-3 py-2 mono text-[12px] leading-[1.55] text-text-primary focus:outline-none focus:border-accent-violet resize-none"
        />
      </FieldLabel>
      <p className="mono text-[11px] text-text-secondary -mt-2">
        The Architect will analyze and propose a connection strategy.
      </p>
    </div>
  );
}
