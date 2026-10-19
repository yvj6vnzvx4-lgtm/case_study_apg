"""Write the compact parquet snapshot the hosted API serves from (backend/serving/)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import config, db  # noqa: E402


def main() -> None:
    config.SERVING_DIR.mkdir(parents=True, exist_ok=True)
    con = db.connect(config.DB_PATH, read_only=False)
    db.run_script(con, "export/serving.sql", out_dir=str(config.SERVING_DIR))
    total = sum(p.stat().st_size for p in config.SERVING_DIR.glob("*.parquet"))
    print(f"wrote {config.SERVING_DIR} ({total / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
