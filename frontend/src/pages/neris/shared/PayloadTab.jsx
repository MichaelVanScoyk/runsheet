import { useState } from 'react';
import { btnStyle } from './nerisUtils';

export default function PayloadTab({ payload }) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(payload, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
        <button onClick={handleCopy} style={btnStyle('#f3f4f6', '#374151', '#d1d5db')}>
          {copied ? '✓ Copied' : 'Copy NERIS JSON Payload'}
        </button>
      </div>
      <pre style={{
        background: '#1f2937', color: '#e5e7eb', padding: '1rem', borderRadius: '6px',
        fontSize: '0.75rem', lineHeight: '1.5', overflow: 'auto', maxHeight: '70vh',
        fontFamily: 'ui-monospace, "Cascadia Code", "Fira Code", monospace'
      }}>
        {json}
      </pre>
    </div>
  );
}
