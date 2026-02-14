"""
Location Services Module

Geocoding, distance calculations, and coordinate management for incidents.
Primary provider: US Census Geocoder (free, government, authoritative)
Fallback provider: Geocodio (free tier, 2500/day)

Usage:
    from services.location.geocoding import geocode_address, geocode_incident
    from services.location.distance import closest_match
"""
