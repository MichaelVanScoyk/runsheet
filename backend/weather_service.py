"""
Weather Service for RunSheet
Fetches historical weather data for incident time
"""

import requests
import logging
from datetime import datetime
from typing import Optional, Dict

logger = logging.getLogger(__name__)

# Weather code to description mapping (Open-Meteo WMO codes)
WEATHER_CODES = {
    0: "Clear",
    1: "Mainly Clear",
    2: "Partly Cloudy",
    3: "Overcast",
    45: "Foggy",
    48: "Depositing Rime Fog",
    51: "Light Drizzle",
    53: "Moderate Drizzle",
    55: "Dense Drizzle",
    56: "Light Freezing Drizzle",
    57: "Dense Freezing Drizzle",
    61: "Slight Rain",
    63: "Moderate Rain",
    65: "Heavy Rain",
    66: "Light Freezing Rain",
    67: "Heavy Freezing Rain",
    71: "Slight Snow",
    73: "Moderate Snow",
    75: "Heavy Snow",
    77: "Snow Grains",
    80: "Slight Rain Showers",
    81: "Moderate Rain Showers",
    82: "Violent Rain Showers",
    85: "Slight Snow Showers",
    86: "Heavy Snow Showers",
    95: "Thunderstorm",
    96: "Thunderstorm with Slight Hail",
    99: "Thunderstorm with Heavy Hail",
}


def celsius_to_fahrenheit(celsius: float) -> int:
    """Convert Celsius to Fahrenheit"""
    return round((celsius * 9/5) + 32)


def fetch_weather_open_meteo(
    latitude: float,
    longitude: float,
    timestamp: datetime
) -> Optional[Dict]:
    """
    Fetch historical weather from Open-Meteo API (free, no key needed).
    
    Args:
        latitude: Location latitude
        longitude: Location longitude
        timestamp: DateTime for weather lookup
        
    Returns:
        Dict with weather data or None on error
    """
    try:
        date_str = timestamp.strftime('%Y-%m-%d')
        hour = timestamp.hour
        
        # Open-Meteo historical weather API
        url = "https://archive-api.open-meteo.com/v1/archive"
        params = {
            "latitude": latitude,
            "longitude": longitude,
            "start_date": date_str,
            "end_date": date_str,
            "hourly": "temperature_2m,weathercode,relativehumidity_2m,windspeed_10m",
            "timezone": "America/New_York",
        }
        
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        hourly = data.get('hourly', {})
        temps = hourly.get('temperature_2m', [])
        codes = hourly.get('weathercode', [])
        humidity = hourly.get('relativehumidity_2m', [])
        wind = hourly.get('windspeed_10m', [])
        
        if hour < len(temps) and hour < len(codes):
            temp_c = temps[hour]
            temp_f = celsius_to_fahrenheit(temp_c)
            code = codes[hour]
            condition = WEATHER_CODES.get(code, "Unknown")
            
            result = {
                "condition": condition,
                "temperature_f": temp_f,
                "temperature_c": round(temp_c, 1),
                "humidity": humidity[hour] if hour < len(humidity) else None,
                "wind_speed_kmh": wind[hour] if hour < len(wind) else None,
                "weather_code": code,
                "source": "open-meteo",
                "fetched_at": datetime.now().isoformat(),
                "for_datetime": timestamp.isoformat(),
            }
            
            # Generate simple description
            result["description"] = f"{condition}, {temp_f}°F"
            
            return result
        
        logger.warning(f"No weather data for hour {hour}")
        return None
        
    except requests.RequestException as e:
        logger.error(f"Weather API error: {e}")
        return None
    except Exception as e:
        logger.error(f"Weather processing error: {e}")
        return None


def fetch_weather_openweathermap(
    latitude: float,
    longitude: float,
    timestamp: datetime,
    api_key: str
) -> Optional[Dict]:
    """
    Fetch historical weather from OpenWeatherMap API (requires API key).
    Note: Historical data requires paid "History API" subscription.
    
    For most users, Open-Meteo is recommended (free).
    """
    try:
        unix_time = int(timestamp.timestamp())
        
        url = "https://api.openweathermap.org/data/2.5/onecall/timemachine"
        params = {
            "lat": latitude,
            "lon": longitude,
            "dt": unix_time,
            "appid": api_key,
            "units": "imperial",
        }
        
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        current = data.get('current', {})
        weather = current.get('weather', [{}])[0]
        
        result = {
            "condition": weather.get('main', 'Unknown'),
            "description": weather.get('description', '').title(),
            "temperature_f": round(current.get('temp', 0)),
            "humidity": current.get('humidity'),
            "wind_speed_mph": current.get('wind_speed'),
            "source": "openweathermap",
            "fetched_at": datetime.now().isoformat(),
            "for_datetime": timestamp.isoformat(),
        }
        
        result["description"] = f"{result['condition']}, {result['temperature_f']}°F"
        
        return result
        
    except requests.RequestException as e:
        logger.error(f"OpenWeatherMap API error: {e}")
        return None
    except Exception as e:
        logger.error(f"Weather processing error: {e}")
        return None


def get_weather_for_incident(
    timestamp: datetime,
    latitude: float = None,
    longitude: float = None,
    provider: str = "open-meteo",
    api_key: str = None
) -> Optional[Dict]:
    """
    Main entry point to fetch weather for an incident.
    
    Args:
        timestamp: Incident dispatch time
        latitude: Location latitude (required)
        longitude: Location longitude (required)
        provider: "open-meteo" or "openweathermap"
        api_key: API key for openweathermap
        
    Returns:
        Dict with weather data or None
    """
    # Coords are required — caller must provide them from settings
    if latitude is None or longitude is None:
        logger.warning("Weather fetch skipped: no coordinates provided")
        return None
    
    if provider == "openweathermap" and api_key:
        return fetch_weather_openweathermap(latitude, longitude, timestamp, api_key)
    else:
        return fetch_weather_open_meteo(latitude, longitude, timestamp)


# CLI for testing
if __name__ == "__main__":
    import sys
    
    # Test with current time or provided datetime
    if len(sys.argv) > 1:
        test_time = datetime.fromisoformat(sys.argv[1])
    else:
        test_time = datetime.now()
    
    print(f"Fetching weather for: {test_time}")
    
    # Default coordinates (Station 48)
    lat, lon = 40.0977, -75.7833
    
    result = fetch_weather_open_meteo(lat, lon, test_time)
    
    if result:
        print(f"\nWeather: {result['description']}")
        print(f"Condition: {result['condition']}")
        print(f"Temperature: {result['temperature_f']}°F ({result['temperature_c']}°C)")
        if result.get('humidity'):
            print(f"Humidity: {result['humidity']}%")
        if result.get('wind_speed_kmh'):
            print(f"Wind: {result['wind_speed_kmh']} km/h")
    else:
        print("Failed to fetch weather")
