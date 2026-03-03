import { PayloadSection, Field } from '../shared/NerisComponents';

export default function LocationDisplay({ incident, payload, expanded, onToggle }) {
  return (
    <PayloadSection title="NERIS Location — NG911 Civic Address (mod_civic_location) — from geocode (read-only)" expanded={expanded} onToggle={onToggle}>
      {payload.base?.location && Object.keys(payload.base.location).length > 0 ? (
        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem 1.25rem', marginBottom: '0.35rem' }}>
            <Field label="number" value={payload.base.location.number} />
            <Field label="street_prefix_direction" value={payload.base.location.street_prefix_direction} />
            <Field label="street" value={payload.base.location.street} />
            <Field label="street_postfix" value={payload.base.location.street_postfix} />
            <Field label="street_postfix_direction" value={payload.base.location.street_postfix_direction} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem 1.25rem', marginBottom: '0.35rem' }}>
            <Field label="postal_community" value={payload.base.location.postal_community} />
            <Field label="county" value={payload.base.location.county} />
            <Field label="state" value={payload.base.location.state} />
            <Field label="postal_code" value={payload.base.location.postal_code} />
            <Field label="country" value={payload.base.location.country} />
          </div>
          {(payload.base.location.floor || payload.base.location.unit_value || payload.base.location.room || payload.base.location.site || payload.base.location.place_type || payload.base.location.incorporated_municipality) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem 1.25rem', marginBottom: '0.35rem' }}>
              <Field label="incorporated_municipality" value={payload.base.location.incorporated_municipality} />
              <Field label="floor" value={payload.base.location.floor} />
              <Field label="unit_value" value={payload.base.location.unit_value} />
              <Field label="room" value={payload.base.location.room} />
              <Field label="site" value={payload.base.location.site} />
              <Field label="place_type" value={payload.base.location.place_type} />
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem 1.25rem', paddingTop: '0.25rem', borderTop: '1px solid #f3f4f6' }}>
            <Field label="latitude" value={incident.latitude} />
            <Field label="longitude" value={incident.longitude} />
            {incident.cross_streets && <Field label="cross_streets" value={incident.cross_streets} />}
          </div>
          {payload.base?.point && (
            <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.15rem' }}>
              CRS: {payload.base.point.crs} · [{payload.base.point.geometry?.coordinates?.[0]}, {payload.base.point.geometry?.coordinates?.[1]}]
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: '0.8rem', color: '#991b1b', fontStyle: 'italic' }}>
          No geocode data — geocode the address on the run sheet to populate location fields.
        </div>
      )}
    </PayloadSection>
  );
}
