/**
 * BrandingContext - Tenant branding for the UI
 * 
 * Fetches branding config from API and applies as CSS custom properties.
 * This ensures consistent branding across web UI and PDF reports.
 */

import { createContext, useContext, useState, useEffect } from 'react';

const BrandingContext = createContext(null);

const DEFAULT_BRANDING = {
  stationName: 'Fire Department',
  stationNumber: '',
  stationShortName: '',
  logoUrl: null,
  primaryColor: '#016a2b',
  secondaryColor: '#eeee01',
  primaryHover: '#015a24',
  primaryLight: '#e6f4ea',
  textColor: '#1a1a1a',
  mutedColor: '#666666',
};

function applyBrandingToCSS(branding) {
  const root = document.documentElement;
  
  root.style.setProperty('--primary-color', branding.primaryColor);
  root.style.setProperty('--primary-hover', branding.primaryHover);
  root.style.setProperty('--primary-light', branding.primaryLight);
  root.style.setProperty('--secondary-color', branding.secondaryColor);
  root.style.setProperty('--text-color', branding.textColor);
  root.style.setProperty('--muted-color', branding.mutedColor);
  
  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result 
      ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
      : '1, 107, 43';
  };
  
  root.style.setProperty('--primary-rgb', hexToRgb(branding.primaryColor));
  root.style.setProperty('--secondary-rgb', hexToRgb(branding.secondaryColor));
}

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchBranding() {
      try {
        const response = await fetch('/api/branding/theme');
        if (!response.ok) throw new Error('Failed to fetch branding');
        
        const data = await response.json();
        
        const newBranding = {
          stationName: data.station_name || DEFAULT_BRANDING.stationName,
          stationNumber: data.station_number || '',
          stationShortName: data.station_short_name || '',
          logoUrl: data.logo_url || null,
          primaryColor: data.primary_color || DEFAULT_BRANDING.primaryColor,
          secondaryColor: data.secondary_color || DEFAULT_BRANDING.secondaryColor,
          primaryHover: data.primary_hover || DEFAULT_BRANDING.primaryHover,
          primaryLight: data.primary_light || DEFAULT_BRANDING.primaryLight,
          textColor: data.text_color || DEFAULT_BRANDING.textColor,
          mutedColor: data.muted_color || DEFAULT_BRANDING.mutedColor,
        };
        
        setBranding(newBranding);
        applyBrandingToCSS(newBranding);
        
      } catch (err) {
        console.error('Failed to load branding:', err);
        setError(err.message);
        applyBrandingToCSS(DEFAULT_BRANDING);
      } finally {
        setLoading(false);
      }
    }

    fetchBranding();
  }, []);

  const refreshBranding = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/branding/theme');
      if (response.ok) {
        const data = await response.json();
        const newBranding = {
          stationName: data.station_name || DEFAULT_BRANDING.stationName,
          stationNumber: data.station_number || '',
          stationShortName: data.station_short_name || '',
          logoUrl: data.logo_url || null,
          primaryColor: data.primary_color || DEFAULT_BRANDING.primaryColor,
          secondaryColor: data.secondary_color || DEFAULT_BRANDING.secondaryColor,
          primaryHover: data.primary_hover || DEFAULT_BRANDING.primaryHover,
          primaryLight: data.primary_light || DEFAULT_BRANDING.primaryLight,
          textColor: data.text_color || DEFAULT_BRANDING.textColor,
          mutedColor: data.muted_color || DEFAULT_BRANDING.mutedColor,
        };
        setBranding(newBranding);
        applyBrandingToCSS(newBranding);
      }
    } catch (err) {
      console.error('Failed to refresh branding:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <BrandingContext.Provider value={{ ...branding, loading, error, refreshBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  const context = useContext(BrandingContext);
  if (!context) {
    throw new Error('useBranding must be used within a BrandingProvider');
  }
  return context;
}

export default BrandingContext;
