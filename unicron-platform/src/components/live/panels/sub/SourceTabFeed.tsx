import { useState } from 'react';
import { FieldLabel, RadioRow, TextInput } from './sourceFields';

type Strategy = 'auto' | 'rss2' | 'atom' | 'json';

export function SourceTabFeed() {
  const [url, setUrl] = useState('https://example.com/feed.xml');
  const [strategy, setStrategy] = useState<Strategy>('auto');

  return (
    <div>
      <FieldLabel label="FEED URL">
        <TextInput value={url} onChange={setUrl} />
      </FieldLabel>
      <FieldLabel label="PARSE STRATEGY">
        <RadioRow
          value={strategy}
          onChange={setStrategy}
          options={[
            { value: 'auto', label: 'AUTO-DETECT' },
            { value: 'rss2', label: 'RSS 2.0' },
            { value: 'atom', label: 'ATOM' },
            { value: 'json', label: 'JSON FEED' },
          ]}
        />
      </FieldLabel>
    </div>
  );
}
