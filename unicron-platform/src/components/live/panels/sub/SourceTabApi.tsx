import { useState } from 'react';
import { FieldLabel, RadioRow, TextInput } from './sourceFields';

type Auth = 'none' | 'api-key' | 'oauth';

export function SourceTabApi() {
  const [endpoint, setEndpoint] = useState('https://api.sam.gov/opportunities/v2/search');
  const [auth, setAuth] = useState<Auth>('api-key');
  const [apiKey, setApiKey] = useState('●●●●●●●●●●●●●●●●●●●●●●●●●●●●●');
  const [docs, setDocs] = useState('https://open.gsa.gov/api/get-opportunities-public-api/');

  return (
    <div>
      <FieldLabel label="ENDPOINT">
        <TextInput value={endpoint} onChange={setEndpoint} />
      </FieldLabel>
      <FieldLabel label="AUTHENTICATION">
        <RadioRow
          value={auth}
          onChange={setAuth}
          options={[
            { value: 'none', label: 'NONE' },
            { value: 'api-key', label: 'API KEY' },
            { value: 'oauth', label: 'OAUTH' },
          ]}
        />
      </FieldLabel>
      {auth === 'api-key' && (
        <FieldLabel label="API KEY">
          <TextInput type="password" value={apiKey} onChange={setApiKey} />
        </FieldLabel>
      )}
      <FieldLabel label="DOCS LINK" optional>
        <TextInput value={docs} onChange={setDocs} />
      </FieldLabel>
    </div>
  );
}
