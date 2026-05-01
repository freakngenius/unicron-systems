import { useState } from 'react';
import { FieldLabel, RadioRow, TextInput } from './sourceFields';

type Freq = 'hourly' | 'daily' | 'on-demand';

export function SourceTabUrl() {
  const [url, setUrl] = useState('https://data.sacramento.gov/permits.json');
  const [desc, setDesc] = useState('Sacramento County permit portal, daily filings');
  const [freq, setFreq] = useState<Freq>('daily');

  return (
    <div>
      <FieldLabel label="URL">
        <TextInput value={url} onChange={setUrl} />
      </FieldLabel>
      <FieldLabel label="DESCRIPTION" optional>
        <TextInput value={desc} onChange={setDesc} />
      </FieldLabel>
      <FieldLabel label="POLL FREQUENCY">
        <RadioRow
          value={freq}
          onChange={setFreq}
          options={[
            { value: 'hourly', label: 'HOURLY' },
            { value: 'daily', label: 'DAILY' },
            { value: 'on-demand', label: 'ON DEMAND' },
          ]}
        />
      </FieldLabel>
    </div>
  );
}
