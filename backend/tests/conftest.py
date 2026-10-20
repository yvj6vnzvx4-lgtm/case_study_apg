"""Builds a tiny fixture dataset as parquet and runs the real SQL pipeline on it.

Each fake writer exists to exercise one rule:
  ALICE SMITH  (party 1, IPI) + Alice Smith (5) + Smith, Alice (13) -> merged
  WD is in_dispute on Alice -> visible, not scored
  DANA GAP only on already-published W2, unlinked -> chain_ambiguous
  CAROL JONES  -> eligible, weaker (one song, one artist) but fast-growing
  BOB SIGNED   -> publisher share points at his share_id           -> has_publisher
  PIPE WRITER  -> publisher preceding_id is 'id|id' (real dump)    -> has_publisher
  ORPHAN WRITER -> sole writer on a work with an unlinked publisher -> has_publisher
  ELI HIT + OTHER HIT share a work whose publisher has a real % and blank preceding_id
                    -> both has_publisher (unallocated slice, not unsigned cowriters)
  PUBLIC DOMAIN                                        -> not_a_person
  OLD TIMER    -> 3 recordings before 2010             -> legacy_catalog
  QUIET PERSON -> last recording 2017                  -> inactive
  TINA THIN  -> 1 recording                          -> insufficient_data
  DAN FARMER   -> 41 songs in one year                 -> high_volume_catalog
  PARTY TYME KARAOKE on Alice's song -> must not inflate reach
"""
import duckdb
import pytest
from fastapi.testclient import TestClient

from app import pipeline
from app.main import app
from app.routes import writers

FIXTURE_SQL = """
CREATE TABLE parties AS SELECT * FROM (VALUES
  (1::BIGINT, 'IPI1', NULL, 'ALICE SMITH',    'ALICE', 'SMITH'),
  (2::BIGINT, 'IPI2', NULL, 'BOB SIGNED',     'BOB',   'SIGNED'),
  (3::BIGINT, 'IPI3', NULL, 'BIG PUBLISHING', NULL,    NULL),
  (4::BIGINT, NULL,   NULL, 'PUBLIC DOMAIN',  NULL,    NULL),
  (5::BIGINT, NULL,   NULL, 'Alice Smith',    'ALICE', 'SMITH'),
  (6::BIGINT, 'IPI6', NULL, 'OLD TIMER',      NULL,    NULL),
  (7::BIGINT, 'IPI7', NULL, 'DAN FARMER',     NULL,    NULL),
  (8::BIGINT, 'IPI8', NULL, 'QUIET PERSON',   NULL,    NULL),
  (9::BIGINT, 'IPI9', NULL, 'TINA THIN',    NULL,    NULL),
  (10::BIGINT, NULL,  NULL, 'CAROL 260858648 JONES', NULL, NULL),
  (11::BIGINT, 'IPIP', NULL, 'PIPE WRITER',    NULL, NULL),
  (12::BIGINT, 'IPIO', NULL, 'ORPHAN WRITER',  NULL, NULL),
  (13::BIGINT, NULL,  NULL, 'Smith, Alice',   'ALICE', 'SMITH'),
  (14::BIGINT, 'IPIG', NULL, 'DANA GAP',       'DANA',  'GAP'),
  (15::BIGINT, 'IPIE', NULL, 'ELI HIT',        'ELI',   'HIT'),
  (16::BIGINT, 'IPIT', NULL, 'OTHER HIT',      'OTHER', 'HIT')
) t(id, ipi_name_number, cisac_society_id, full_name, first_name, last_name);

CREATE TABLE works AS
SELECT id, NULL::VARCHAR AS iswc, 'SONG ' || id AS title, NULL::VARCHAR AS language_and_script_code,
       NULL::VARCHAR AS duration, false AS in_dispute, false AS is_arrangement_of_traditional_work,
       NULL::VARCHAR AS reversion_date, NULL::VARCHAR AS is_composite_work
FROM (SELECT unnest(['W1','W2','W3','W4','W5','W6','W7','W8','W9','WP','WO','WD','WH']) AS id
      UNION ALL SELECT 'F' || i FROM range(41) r(i));
UPDATE works SET in_dispute = true WHERE id = 'WD';

CREATE TABLE releases AS SELECT * FROM (VALUES
  ('W1', 'USAAA2400001', 'ARTIST A', DATE '2024-11-01'),   -- latest date -> as_of_year 2024
  ('W1', 'USAAA2400001', '"ARTIST A" feat. OTHER', DATE '2024-11-01'), -- same ISRC, messy credit
  ('W1', 'USKRA2400099', 'PARTY TYME KARAOKE', DATE '2024-06-01'), -- cover channel, not reach
  ('W1', 'USAAA2300002', 'ARTIST B', DATE '0001-01-01'),   -- junk date -> NULL
  ('W1', 'USAAA2400003', 'ARTIST C', NULL),
  ('W2', 'USAAA2200004', 'ARTIST D', NULL),
  ('W3', 'USAAA2400005', 'ARTIST X', NULL),
  ('W4', 'USAAA2400006', 'ARTIST P', NULL),
  ('W4', 'USAAA2400007', 'ARTIST Q', NULL),
  ('W4', 'USAAA2400008', 'ARTIST R', NULL),
  ('W5', 'USAAA9500010', 'ARTIST O', NULL),
  ('W5', 'USAAA9800011', 'ARTIST O', NULL),
  ('W5', 'USAAA0100012', 'ARTIST O', NULL),
  ('W5', 'USAAA2400013', 'ARTIST O', NULL),
  ('W6', 'USAAA2400014', 'ARTIST E', NULL),
  ('W7', 'USAAA1500015', 'ARTIST Z', NULL),
  ('W7', 'USAAA1600016', 'ARTIST Z', NULL),
  ('W7', 'USAAA1700017', 'ARTIST Z', NULL),
  ('W8', 'USAAA2400018', 'ARTIST T', NULL),
  ('W9', 'USAAA2400019', 'ARTIST F', NULL),
  ('W9', 'USAAA2400020', 'ARTIST F', NULL),
  ('W9', 'BADISRC',      'ARTIST F', DATE '2023-05-05'),    -- malformed ISRC -> falls back to release_date
  ('WP', 'USAAA2400030', 'ARTIST PIPE', NULL),
  ('WO', 'USAAA2400031', 'ARTIST ORPH', NULL),
  ('WD', 'USAAA2400032', 'ARTIST DISP', NULL),
  ('WH', 'USAAA2400040', 'ARTIST HIT', NULL),
  ('WH', 'USAAA2400041', 'ARTIST HIT2', NULL),
  ('WH', 'USAAA2400042', 'ARTIST HIT3', NULL)
) t(work_id, isrc, artist_name, release_date)
UNION ALL
SELECT 'F' || i, 'USFRM24' || lpad(i::VARCHAR, 5, '0'), 'FARM ARTIST ' || i, NULL FROM range(41) r(i);

CREATE TABLE shares AS SELECT * FROM (VALUES
  ('S1',  'W1', 1::BIGINT,  'ComposerLyricist',  NULL, NULL),
  ('S2',  'W2', 1::BIGINT,  'Composer',          NULL, NULL),
  ('S3',  'W2', 2::BIGINT,  'Composer',          NULL, NULL),
  ('S4',  'W2', 3::BIGINT,  'OriginalPublisher', 50,   'S3'),
  ('S5',  'W3', 2::BIGINT,  'Composer',          NULL, NULL),
  ('S6',  'W3', 3::BIGINT,  'OriginalPublisher', 100,  'S5'),
  ('S7',  'W4', 4::BIGINT,  'Composer',          NULL, NULL),
  ('S8',  'W5', 6::BIGINT,  'Composer',          NULL, NULL),
  ('S9',  'W6', 5::BIGINT,  'Lyricist',          NULL, NULL),
  ('S10', 'W7', 8::BIGINT,  'Composer',          NULL, NULL),
  ('S11', 'W8', 9::BIGINT,  'Composer',          NULL, NULL),
  ('S12', 'W9', 10::BIGINT, 'Composer',          NULL, NULL),
  ('SPIPE', 'WP', 11::BIGINT, 'Composer', NULL, NULL),
  ('SPUB',  'WP', 3::BIGINT,  'OriginalPublisher', 100, 'SPIPE|SX'),
  ('SORPH', 'WO', 12::BIGINT, 'Composer', NULL, NULL),
  ('SOP',   'WO', 3::BIGINT,  'OriginalPublisher', 100, NULL),
  ('SDISP', 'WD', 13::BIGINT, 'Composer',          NULL, NULL),
  ('SGAP',  'W2', 14::BIGINT, 'Composer',          NULL, NULL),
  ('SELI',  'WH', 15::BIGINT, 'Composer',          NULL, NULL),
  ('SOTH',  'WH', 16::BIGINT, 'Composer',          NULL, NULL),
  ('SPCT',  'WH', 3::BIGINT,  'OriginalPublisher', 25,   NULL)
) t(id, work_id, party_id, party_role, share_percentage, preceding_id)
UNION ALL
SELECT 'F' || i, 'F' || i, 7::BIGINT, 'Composer', NULL, NULL FROM range(41) r(i);

ALTER TABLE shares ADD COLUMN validity_start_date DATE;
ALTER TABLE shares ADD COLUMN validity_end_date VARCHAR;
ALTER TABLE shares ADD COLUMN territory_code VARCHAR DEFAULT 'US';
ALTER TABLE shares ADD COLUMN use_type VARCHAR DEFAULT 'Stream';
"""


@pytest.fixture()
def con(tmp_path):
    raw = duckdb.connect()
    raw.execute(FIXTURE_SQL)
    for t in ("parties", "works", "releases", "shares"):
        raw.execute(f"COPY {t} TO '{tmp_path}/{t}.parquet' (FORMAT parquet)")
    c = duckdb.connect(str(tmp_path / "test.duckdb"))
    pipeline.build(c, tmp_path)
    yield c
    c.close()


def writer(con, name: str) -> dict:
    cur = con.execute("SELECT * FROM writer_scores WHERE upper(display_name) = $n", {"n": name})
    cols = [d[0] for d in cur.description]
    return dict(zip(cols, cur.fetchone()))


@pytest.fixture()
def client(con):
    app.dependency_overrides[writers.get_con] = lambda: con
    yield TestClient(app)
    app.dependency_overrides.clear()
