"""Minimal Spotify Web API client (client-credentials flow).

Used only by scripts/enrich_spotify.py on a SQL-shortlisted set of ISRCs.
Stream counts and track popularity are not available in Development Mode;
we cache identity, listen URL, album type, and artist genres instead.
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
        self._artist_genres: dict[str, list[str]] = {}

    def _headers(self) -> dict:
        if not self._token or time.time() > self._expires - 60:
            r = self._http.post(TOKEN_URL, data={"grant_type": "client_credentials"}, auth=self._auth)
            r.raise_for_status()
            body = r.json()
            self._token, self._expires = body["access_token"], time.time() + body["expires_in"]
        return {"Authorization": f"Bearer {self._token}"}

    def _get(self, path: str, params: dict | None = None) -> httpx.Response:
        for _ in range(2):
            r = self._http.get(f"{API}{path}", params=params, headers=self._headers())
            if r.status_code == 429:
                time.sleep(int(r.headers.get("Retry-After", "2")))
                continue
            r.raise_for_status()
            return r
        r.raise_for_status()
        return r

    def track_by_isrc(self, isrc: str) -> dict | None:
        """Return the top Spotify match for an ISRC, or None."""
        r = self._get("/search", {"q": f"isrc:{isrc}", "type": "track", "limit": 1})
        items = r.json()["tracks"]["items"]
        return items[0] if items else None

    def genres_for_artists(self, artist_ids: list[str]) -> list[str]:
        """Unique genres for the given artist IDs (one GET per unseen artist)."""
        out: list[str] = []
        seen: set[str] = set()
        for aid in artist_ids:
            if not aid:
                continue
            if aid not in self._artist_genres:
                body = self._get(f"/artists/{aid}").json()
                self._artist_genres[aid] = body.get("genres") or []
            for g in self._artist_genres[aid]:
                key = g.lower()
                if key not in seen:
                    seen.add(key)
                    out.append(g)
        return out
