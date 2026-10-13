"""PostgreSQL connections, versioned schema and first-run sample data."""

import json
from pathlib import Path

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from atlas.config import Settings
from atlas.documents import clean_document, searchable_text


class Database:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.pool = ConnectionPool(
            settings.database_url,
            kwargs={"autocommit": True, "row_factory": dict_row, "connect_timeout": 5},
            min_size=1,
            max_size=5,
            check=ConnectionPool.check_connection,
            open=False,
        )

    def open(self) -> None:
        self.pool.open(wait=True, timeout=30)
        self.migrate()
        self.seed_if_empty()

    def close(self) -> None:
        self.pool.close()

    def migrate(self) -> None:
        """Apply SQL migrations atomically, serialized across application instances."""
        with self.pool.connection() as connection, connection.transaction():
            connection.execute("SELECT pg_advisory_xact_lock(894540000)")
            connection.execute(
                "CREATE TABLE IF NOT EXISTS schema_migrations "
                "(name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
            )
            applied = {
                row["name"] for row in connection.execute("SELECT name FROM schema_migrations")
            }
            files = sorted(Path(self.settings.migration_dir).glob("[0-9][0-9][0-9][0-9]_*.sql"))
            names = {path.name for path in files}
            if applied - names:
                raise RuntimeError(f"Database has unknown migrations: {sorted(applied - names)}")
            for path in files:
                if path.name in applied:
                    continue
                connection.execute(path.read_text(encoding="utf-8"), prepare=False)
                connection.execute("INSERT INTO schema_migrations (name) VALUES (%s)", (path.name,))

    def seed_if_empty(self) -> None:
        """Seed examples once; an intentionally empty collection remains empty."""
        with self.pool.connection() as connection, connection.transaction():
            connection.execute("SELECT pg_advisory_xact_lock(894540001)")
            if connection.execute(
                "SELECT 1 FROM app_settings WHERE key = 'initial_collection'"
            ).fetchone():
                return
            if connection.execute("SELECT EXISTS (SELECT 1 FROM events)").fetchone()["exists"]:
                connection.execute(
                    "INSERT INTO app_settings (key, value) VALUES ('initial_collection', %s)",
                    ("existing",),
                )
                return
            for event in json.loads(self.settings.seed_file.read_text(encoding="utf-8")):
                body, plain = clean_document(event["body"])
                connection.execute(
                    """INSERT INTO events
                       (id, bp, title, summary, era, accent, body, body_text, search_text,
                        custom, date_mode, date_value)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, FALSE, 'bp', %s)""",
                    (
                        event["id"],
                        event["bp"],
                        event["title"],
                        event["summary"],
                        event["era"],
                        event["accent"],
                        body,
                        plain,
                        searchable_text(event["title"], event["summary"], plain),
                        event["bp"],
                    ),
                )
            connection.execute(
                "INSERT INTO app_settings (key, value) VALUES ('initial_collection', %s)",
                ("seeded",),
            )
