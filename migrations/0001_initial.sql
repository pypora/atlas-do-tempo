CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE events (
    id TEXT PRIMARY KEY,
    bp BIGINT NOT NULL CHECK (bp BETWEEN 0 AND 4540000000),
    title VARCHAR(100) NOT NULL CHECK (length(btrim(title)) > 0),
    summary VARCHAR(240) NOT NULL DEFAULT '',
    era VARCHAR(60) NOT NULL DEFAULT '',
    accent TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    body_text TEXT NOT NULL DEFAULT '',
    search_text TEXT NOT NULL DEFAULT '',
    custom BOOLEAN NOT NULL DEFAULT TRUE,
    date_mode VARCHAR(3) NOT NULL DEFAULT 'bp' CHECK (date_mode IN ('bp', 'bce', 'ce')),
    date_value BIGINT NOT NULL CHECK (date_value >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX events_time_idx ON events (bp DESC, title);
CREATE INDEX events_search_idx ON events USING GIN (search_text gin_trgm_ops);

CREATE TABLE event_links (
    source_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    target_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    PRIMARY KEY (source_id, target_id),
    CHECK (source_id <> target_id)
);

CREATE INDEX event_links_target_idx ON event_links (target_id);
