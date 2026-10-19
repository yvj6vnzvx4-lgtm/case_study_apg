"""Minimal Spotify Web API client (client-credentials flow).

Used only by scripts/enrich_spotify.py on a SQL-shortlisted set of ISRCs,
so we stay well inside rate limits. Results are cached in the spotify_tracks table.
"""
import time

import httpx

from app import config

TOKEN_URL = "https://accounts.spotify.com/api/token"
API = "https://api.spotify.com/v1"


class SpotifyClient:
    def __init__(self, client_id: str = config.SPOTIFY_CLIENT_ID, client_secret: str = config.SPOTIFY_CLIENT_SECRET):
        self._auth = (client_id, client_secret)
        self._token: str | None = None
        self._expires = 0.0
        self._http = httpx.Client(timeout=10)

    def _headers(self) -> dict:
        if not self._token or time.time() > self._expires - 60:
            r = self._http.post(TOKEN_URL, data={"grant_type": "client_credentials"}, auth=self._auth)
            r.raise_for_status()
            body = r.json()
            self._token, self._expires = body["access_token"], time.time() + body["expires_in"]
        return {"Authorization": f"Bearer {self._token}"}

    def track_by_isrc(self, isrc: str) -> dict | None:
        """Return the top Spotify match for an ISRC, or None. Retries once on 429."""
        for _ in range(2):
            r = self._http.get(f"{API}/search", params={"q": f"isrc:{isrc}", "type": "track", "limit": 1}, headers=self._headers())
            if r.status_code == 429:
                time.sleep(int(r.headers.get("Retry-After", "2")))
                continue
            r.raise_for_status()
            items = r.json()["tracks"]["items"]
            return items[0] if items else None
        return None
