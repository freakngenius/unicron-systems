import { useState } from 'react';
import { FieldLabel, RadioRow } from './sourceFields';

type FreqMode = 'one-time' | 'weekly';

export function SourceTabFile() {
  const [mode, setMode] = useState<FreqMode>('weekly');

  return (
    <div>
      <FieldLabel label="DROP A FILE OR CLICK TO UPLOAD">
        <div className="border border-dashed border-border-default rounded-md p-12 text-center hover:border-border-hover transition-colors cursor-pointer">
          <div className="mono text-[12px] text-text-secondary">
            supported: csv, json, jsonl, xml, xlsx
          </div>
        </div>
      </FieldLabel>
      <FieldLabel label="UPDATE FREQUENCY">
        <RadioRow
          value={mode}
          onChange={setMode}
          options={[
            { value: 'one-time', label: 'ONE-TIME SNAPSHOT' },
            { value: 'weekly', label: 'RE-UPLOAD WEEKLY' },
          ]}
        />
      </FieldLabel>
    </div>
  );
}
