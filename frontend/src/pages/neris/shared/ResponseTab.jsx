import { useState } from 'react';

export default function ResponseTab({ result }) {
  return (
    <div>
      <div style={{
        padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: '6px',
        background: result.success ? '#f0fdf4' : '#fef2f2',
        border: `1px solid ${result.success ? '#bbf7d0' : '#fecaca'}`,
      }}>
        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: result.success ? '#166534' : '#991b1b' }}>
          {result.success ? '✓ Successfully submitted to NERIS sandbox' : '✗ NERIS submission failed'}
        </div>
        {result.neris_id && (
          <div style={{ fontSize: '0.85rem', color: '#166534', marginTop: '0.25rem' }}>
            NERIS Incident ID: <code style={{ background: '#dcfce7', padding: '2px 6px', borderRadius: '3px' }}>{result.neris_id}</code>
          </div>
        )}
        {result.api_error && (
          <div style={{ fontSize: '0.85rem', color: '#991b1b', marginTop: '0.25rem' }}>API Error: {result.api_error}</div>
        )}
        {result.message && (
          <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>{result.message}</div>
        )}
      </div>

      {result.errors?.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#991b1b', marginBottom: '0.35rem' }}>NERIS Validation Errors</div>
          {result.errors.map((e, i) => (
            <div key={i} style={{ fontSize: '0.8rem', color: '#991b1b', padding: '2px 0' }}>
              ✗ <code>{e.field}</code> — {e.message}
            </div>
          ))}
        </div>
      )}

      {result.warnings?.length > 0 && (
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#92400e', marginBottom: '0.35rem' }}>NERIS Warnings</div>
          {result.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: '0.8rem', color: '#92400e', padding: '2px 0' }}>
              ⚠ <code>{w.field}</code> — {w.message}
            </div>
          ))}
        </div>
      )}

      {result.body && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>Raw NERIS API Response</div>
          <pre style={{
            background: '#1f2937', color: '#e5e7eb', padding: '0.75rem', borderRadius: '6px',
            fontSize: '0.75rem', overflow: 'auto', maxHeight: '300px', fontFamily: 'ui-monospace, monospace'
          }}>
            {JSON.stringify(result.body, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
