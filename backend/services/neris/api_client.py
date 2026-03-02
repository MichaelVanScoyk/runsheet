"""
NERIS API Client

Handles authentication and HTTP communication with the NERIS V1 API.
Supports both test and production environments.

Auth: OAuth2 client_credentials flow via /token endpoint.
Uses Basic Auth header (base64 client_id:client_secret) per official NERIS client.

Endpoints (from official ulfsri/neris-api-client v1.3+):
  POST   /incident/{fd_neris_id}                       — Create incident
  POST   /incident/{fd_neris_id}/validate               — Validate incident (no create)
  PATCH  /incident/{fd_neris_id}/{neris_incident_id}    — Update existing incident
  GET    /entity/{fd_neris_id}                          — Get entity info
  POST   /entity/{fd_neris_id}/station                  — Create station
  POST   /entity/{fd_neris_id}/station/{sid}/unit       — Create unit
"""

import base64
import httpx
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

# Environments
NERIS_URLS = {
    "test": "https://api-test.neris.fsri.org/v1",
    "production": "https://api.neris.fsri.org/v1",
}


class NerisApiError(Exception):
    """Raised when NERIS API returns an error."""
    def __init__(self, status_code: int, detail: str, body: dict | None = None):
        self.status_code = status_code
        self.detail = detail
        self.body = body
        super().__init__(f"NERIS API {status_code}: {detail}")


class NerisApiClient:
    """
    HTTP client for NERIS V1 API.
    
    Auth follows the official ulfsri/neris-api-client pattern:
    - Token endpoint: {base_url}/token
    - client_credentials grant: Basic Auth header + grant_type in body
    
    Usage:
        client = NerisApiClient(
            client_id="...",
            client_secret="...",
            environment="test",
        )
        result = await client.create_incident("FD09190828", payload)
    """

    def __init__(
        self,
        client_id: str,
        client_secret: str,
        environment: str = "test",
    ):
        self.client_id = client_id
        self.client_secret = client_secret
        self.base_url = NERIS_URLS.get(environment, NERIS_URLS["test"])
        
        # Pre-compute Basic Auth header (matches official client)
        self._basic_auth = base64.b64encode(
            f"{client_id}:{client_secret}".encode("utf-8")
        ).decode("utf-8")
        
        self._access_token: Optional[str] = None
        self._token_expires_at: Optional[datetime] = None

    async def _ensure_token(self):
        """Get or refresh OAuth2 access token via client_credentials grant."""
        now = datetime.now(timezone.utc)
        if self._access_token and self._token_expires_at and now < self._token_expires_at:
            return

        token_url = f"{self.base_url}/token"
        
        async with httpx.AsyncClient() as http:
            resp = await http.post(
                token_url,
                headers={
                    "Authorization": f"Basic {self._basic_auth}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data={"grant_type": "client_credentials"},
            )

        if resp.status_code != 200:
            logger.error(f"NERIS auth failed: {resp.status_code} {resp.text}")
            raise NerisApiError(
                resp.status_code,
                "Authentication failed",
                resp.json() if resp.text else None,
            )

        data = resp.json()
        self._access_token = data["access_token"]
        # Expire 60 seconds early to avoid edge cases
        expires_in = data.get("expires_in", 3600)
        self._token_expires_at = now + timedelta(seconds=expires_in - 60)
        logger.info("NERIS token acquired, expires in %d seconds", expires_in)

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self._access_token}",
            "Content-Type": "application/json",
        }

    async def _request(self, method: str, path: str, json_body: dict | None = None) -> dict:
        """Make authenticated request to NERIS API."""
        await self._ensure_token()

        url = f"{self.base_url}{path}"
        logger.info(f"NERIS {method} {url}")

        async with httpx.AsyncClient(timeout=30.0) as http:
            resp = await http.request(
                method=method,
                url=url,
                json=json_body,
                headers=self._headers(),
            )

        if resp.status_code >= 400:
            body = None
            try:
                body = resp.json()
            except Exception:
                pass
            detail = body.get("detail", resp.text) if body else resp.text
            logger.error(f"NERIS {method} {url} → {resp.status_code}: {detail}")
            raise NerisApiError(resp.status_code, str(detail), body)

        if resp.status_code == 204:
            return {}

        return resp.json()

    # ---- Incident endpoints ----
    # Paths match official client: /incident/{neris_id_entity}

    async def create_incident(self, department_neris_id: str, payload: dict) -> dict:
        """POST new incident. Returns response with neris_id."""
        return await self._request("POST", f"/incident/{department_neris_id}", payload)

    async def validate_incident(self, department_neris_id: str, payload: dict) -> dict:
        """POST validate incident without creating it."""
        return await self._request("POST", f"/incident/{department_neris_id}/validate", payload)

    async def update_incident(self, department_neris_id: str, incident_neris_id: str, patch_payload: dict) -> dict:
        """PATCH existing incident by its NERIS incident ID."""
        return await self._request("PATCH", f"/incident/{department_neris_id}/{incident_neris_id}", patch_payload)

    async def get_incident(self, department_neris_id: str, incident_neris_id: str) -> dict:
        """GET incident by NERIS ID (not currently in official client but follows pattern)."""
        return await self._request("GET", f"/incident/{department_neris_id}/{incident_neris_id}")

    # ---- Entity endpoints ----

    async def get_entity(self, neris_id: str) -> dict:
        """GET department entity info."""
        return await self._request("GET", f"/entity/{neris_id}")

    # ---- Station endpoints ----

    async def create_station(self, neris_id_entity: str, payload: dict) -> dict:
        """POST new station."""
        return await self._request("POST", f"/entity/{neris_id_entity}/station", payload)

    # ---- Unit endpoints ----

    async def create_unit(self, neris_id_entity: str, neris_id_station: str, payload: dict) -> dict:
        """POST new unit to a station."""
        return await self._request("POST", f"/entity/{neris_id_entity}/station/{neris_id_station}", payload)
