SELECT DISTINCT
    w.work_id, w.title, w.iswc, w.in_dispute, ws.party_role, ws.is_published,
    r.isrc, r.artist_name, r.recording_year, r.release_date,
    st.spotify_id, st.track_name, st.spotify_url, st.album_type, st.genres AS spotify_genres
FROM writer_shares ws
JOIN works w USING (work_id)
LEFT JOIN releases r USING (work_id)
LEFT JOIN spotify_tracks st USING (isrc)
WHERE ws.writer_id = $writer_id
ORDER BY st.spotify_id IS NOT NULL DESC, r.recording_year DESC NULLS LAST, w.title, w.work_id, r.isrc, r.artist_name, ws.party_role;
