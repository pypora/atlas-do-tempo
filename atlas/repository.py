"""All SQL used by the Atlas API; no HTTP concerns live here."""

from __future__ import annotations

from uuid import uuid4

from psycopg import Connection

from atlas.database import Database
from atlas.documents import clean_document, search_terms, searchable_text
from atlas.schemas import EVENT_ID, EventInput, ImportPayload


class InvalidReference(ValueError):
    pass


class EventRepository:
    def __init__(self, database: Database) -> None:
        self.database = database

    @staticmethod
    def _events(connection: Connection, where: str = "", params: tuple = ()) -> list[dict]:
        rows = connection.execute(
            "SELECT * FROM events " + where + " ORDER BY bp DESC, lower(title), id", params
        ).fetchall()
        if not rows:
            return []
        by_id = {row["id"]: row for row in rows}
        ids = list(by_id)
        outgoing: dict[str, list[str]] = {event_id: [] for event_id in ids}
        incoming: dict[str, list[str]] = {event_id: [] for event_id in ids}
        for link in connection.execute(
            """SELECT source_id, target_id FROM event_links
               WHERE source_id = ANY(%s) OR target_id = ANY(%s)
               ORDER BY source_id, target_id""",
            (ids, ids),
        ):
            if link["source_id"] in outgoing:
                outgoing[link["source_id"]].append(link["target_id"])
            if link["target_id"] in incoming:
                incoming[link["target_id"]].append(link["source_id"])
        results = []
        for row in rows:
            event = dict(row)
            event.pop("body_text")
            event.pop("search_text")
            event["dateMode"] = event.pop("date_mode")
            event["dateValue"] = event.pop("date_value")
            event["created_at"] = event["created_at"].isoformat()
            event["updated_at"] = event["updated_at"].isoformat()
            event["relatedIds"] = outgoing[event["id"]]
            event["referencedByIds"] = incoming[event["id"]]
            results.append(event)
        return results

    def list(self, query: str = "") -> list[dict]:
        terms = search_terms(query[:100]) if query else []
        with self.database.pool.connection() as connection:
            if query and not terms:
                return []
            if terms:
                where = "WHERE " + " AND ".join("search_text LIKE %s" for _ in terms)
                params = tuple(f"%{term}%" for term in terms)
                return self._events(connection, where, params)
            return self._events(connection)

    def get(self, event_id: str) -> dict | None:
        with self.database.pool.connection() as connection:
            items = self._events(connection, "WHERE id = %s", (event_id,))
            return items[0] if items else None

    @staticmethod
    def _check_links(connection: Connection, event_id: str, links: list[str]) -> None:
        if event_id in links:
            raise InvalidReference("Um documento não pode referenciar a si mesmo.")
        if not links:
            return
        found = {
            row["id"]
            for row in connection.execute("SELECT id FROM events WHERE id = ANY(%s)", (links,))
        }
        if found != set(links):
            raise InvalidReference("Uma referência não existe mais.")

    @staticmethod
    def _insert(
        connection: Connection, event_id: str, item: EventInput, custom: bool = True
    ) -> None:
        body, plain = clean_document(item.body)
        connection.execute(
            """INSERT INTO events
               (id, bp, title, summary, era, body, body_text, search_text,
                custom, date_mode, date_value)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                event_id,
                item.bp,
                item.title,
                item.summary.strip(),
                item.era.strip(),
                body,
                plain,
                searchable_text(item.title, item.summary, plain),
                custom,
                item.dateMode,
                item.dateValue,
            ),
        )

    @staticmethod
    def _set_links(connection: Connection, event_id: str, links: list[str]) -> None:
        connection.execute("DELETE FROM event_links WHERE source_id = %s", (event_id,))
        if links:
            with connection.cursor() as cursor:
                cursor.executemany(
                    "INSERT INTO event_links (source_id, target_id) VALUES (%s, %s)",
                    [(event_id, target_id) for target_id in links],
                )

    def create(self, item: EventInput) -> dict:
        event_id = "user-" + str(uuid4())
        with self.database.pool.connection() as connection, connection.transaction():
            self._check_links(connection, event_id, item.relatedIds)
            self._insert(connection, event_id, item)
            self._set_links(connection, event_id, item.relatedIds)
            return self._events(connection, "WHERE id = %s", (event_id,))[0]

    def update(self, event_id: str, item: EventInput) -> dict | None:
        with self.database.pool.connection() as connection, connection.transaction():
            if not connection.execute("SELECT 1 FROM events WHERE id = %s", (event_id,)).fetchone():
                return None
            self._check_links(connection, event_id, item.relatedIds)
            body, plain = clean_document(item.body)
            connection.execute(
                """UPDATE events SET bp = %s, title = %s, summary = %s, era = %s,
                   body = %s, body_text = %s, search_text = %s, date_mode = %s,
                   date_value = %s, updated_at = now() WHERE id = %s""",
                (
                    item.bp,
                    item.title,
                    item.summary.strip(),
                    item.era.strip(),
                    body,
                    plain,
                    searchable_text(item.title, item.summary, plain),
                    item.dateMode,
                    item.dateValue,
                    event_id,
                ),
            )
            self._set_links(connection, event_id, item.relatedIds)
            return self._events(connection, "WHERE id = %s", (event_id,))[0]

    def delete(self, event_id: str) -> bool:
        with self.database.pool.connection() as connection, connection.transaction():
            return connection.execute("DELETE FROM events WHERE id = %s", (event_id,)).rowcount > 0

    def import_events(self, payload: ImportPayload) -> tuple[int, int]:
        imported = skipped = 0
        with self.database.pool.connection() as connection, connection.transaction():
            known = {row["id"] for row in connection.execute("SELECT id FROM events")}
            new_ids: set[str] = set()
            for source in payload.events:
                event_id = source.get("id")
                if not isinstance(event_id, str) or not EVENT_ID.fullmatch(event_id):
                    raise ValueError("Identificador inválido no arquivo.")
                if event_id in known:
                    skipped += 1
                    continue
                raw = {
                    key: source[key]
                    for key in (
                        "title",
                        "summary",
                        "body",
                        "era",
                        "dateMode",
                        "dateValue",
                        "relatedIds",
                    )
                    if key in source
                }
                if "dateValue" not in raw and "bp" in source:
                    raw["dateValue"] = source["bp"]
                raw["relatedIds"] = []
                item = EventInput.model_validate(raw)
                self._insert(connection, event_id, item)
                known.add(event_id)
                new_ids.add(event_id)
                imported += 1
            for source in payload.events:
                event_id = source["id"]
                if event_id not in new_ids:
                    continue
                links = source.get("relatedIds", [])
                if not isinstance(links, list) or len(links) > 100:
                    raise ValueError("Referências inválidas no arquivo.")
                if any(not isinstance(link, str) for link in links):
                    raise ValueError("Referências inválidas no arquivo.")
                links = list(dict.fromkeys(links))
                if any(not EVENT_ID.fullmatch(link) for link in links):
                    raise ValueError("Referências inválidas no arquivo.")
                links = [link for link in links if link != event_id and link in known]
                self._set_links(connection, event_id, links)
        return imported, skipped
