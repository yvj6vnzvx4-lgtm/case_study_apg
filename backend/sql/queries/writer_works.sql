SELECT DISTINCT
    w.work_id, w.title, w.iswc, ws.party_role, ws.is_published,
    r.isrc, r.artist_name, r.recording_year, r.release_date, st.popularity
FROM writer_shares ws
JOIN works w USING (work_id)
LEFT JOIN releases r USING (work_id)
LEFT JOIN spotify_tracks st USING (isrc)
WHERE ws.writer_id = $writer_id
ORDER BY st.popularity DESC NULLS LAST, r.recording_year DESC NULLS LAST, w.title, w.work_id, r.isrc, ws.party_role;
