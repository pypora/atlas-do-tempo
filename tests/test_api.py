import os

import psycopg
import pytest
from fastapi.testclient import TestClient

from atlas.api import create_app
from atlas.config import Settings
from atlas.database import Database


@pytest.fixture
def client():
    dsn = os.getenv("TEST_DATABASE_URL")
    if not dsn:
        pytest.skip("TEST_DATABASE_URL não configurada")
    settings = Settings(dsn, "test-secret", "https://atlas.example.org")
    with TestClient(create_app(settings)) as instance:
        with psycopg.connect(dsn) as connection:
            connection.execute("TRUNCATE events CASCADE")
        yield instance


HEADERS = {"X-Homelab-Gateway": "test-secret"}
WRITE = {**HEADERS, "Origin": "https://atlas.example.org"}


def payload(title="Primeiro", related=None):
    return {
        "title": title,
        "summary": "Resumo",
        "body": "<p>Dinossáuros <strong>antigos</strong></p>",
        "era": "HUMANIDADE",
        "dateMode": "bp",
        "dateValue": 100,
        "relatedIds": related or [],
    }


def test_access_controls_and_health(client):
    assert client.get("/health").status_code == 200
    assert client.get("/api/events").status_code == 403
    assert client.get("/api/events", headers=HEADERS).status_code == 200
    assert client.post("/api/events", headers=HEADERS, json=payload()).status_code == 403
    assert client.get("/", headers=HEADERS).status_code == 200


def test_crud_search_and_relations(client):
    first = client.post("/api/events", headers=WRITE, json=payload()).json()["event"]
    second = client.post(
        "/api/events", headers=WRITE, json=payload("Segundo", [first["id"]])
    ).json()["event"]
    assert first["id"] in second["relatedIds"]
    by_id = {
        item["id"]: item for item in client.get("/api/events", headers=HEADERS).json()["events"]
    }
    assert second["id"] in by_id[first["id"]]["referencedByIds"]
    assert [
        item["id"]
        for item in client.get("/api/search?q=dinossauros", headers=HEADERS).json()["events"]
    ] == [first["id"], second["id"]]
    invalid = payload("Falha", ["missing"])
    assert client.post("/api/events", headers=WRITE, json=invalid).status_code == 400
    assert len(client.get("/api/events", headers=HEADERS).json()["events"]) == 2
    updated = client.put(
        f"/api/events/{first['id']}", headers=WRITE, json=payload("Atualizado")
    ).json()["event"]
    assert updated["title"] == "Atualizado"
    assert client.delete(f"/api/events/{first['id']}", headers=WRITE).json() == {"deleted": True}
    remaining = client.get("/api/events", headers=HEADERS).json()["events"]
    assert remaining[0]["relatedIds"] == []


def test_import_is_atomic_and_does_not_rewrite_existing_links(client):
    first = client.post("/api/events", headers=WRITE, json=payload()).json()["event"]
    bad = {
        "format": "atlas-do-tempo-v1",
        "events": [
            {"id": "a", **payload("Novo")},
            {"id": "b", **payload("Inválido"), "dateValue": -1},
        ],
    }
    assert client.post("/api/import", headers=WRITE, json=bad).status_code == 400
    assert len(client.get("/api/events", headers=HEADERS).json()["events"]) == 1
    good = {
        "format": "atlas-do-tempo-v1",
        "events": [
            {"id": "a", **payload("Novo", [first["id"]])},
            {"id": first["id"], **payload("Ignorado", ["a"])},
        ],
    }
    assert client.post("/api/import", headers=WRITE, json=good).json() == {
        "imported": 1,
        "skipped": 1,
    }
    by_id = {
        item["id"]: item for item in client.get("/api/events", headers=HEADERS).json()["events"]
    }
    assert by_id["a"]["relatedIds"] == [first["id"]]
    assert by_id[first["id"]]["relatedIds"] == []


def test_empty_collection_stays_empty_after_restart(client):
    dsn = os.environ["TEST_DATABASE_URL"]
    with psycopg.connect(dsn) as connection:
        connection.execute("TRUNCATE events CASCADE")
    database = Database(Settings(dsn, "test-secret", "https://atlas.example.org"))
    try:
        database.open()
        with database.pool.connection() as connection:
            assert connection.execute("SELECT count(*) AS n FROM events").fetchone()["n"] == 0
    finally:
        database.close()
