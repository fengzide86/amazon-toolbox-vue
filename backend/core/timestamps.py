"""UTC storage and explicit wire timestamps; never rewrite historical rows here."""

from datetime import datetime, timezone


def utc_now() -> datetime:
    """Naive UTC matches existing SQL DATETIME columns and UTC server defaults."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def utc_iso(value: datetime | None) -> str | None:
    """Serialize a known UTC column, including its offset for browser parsing."""
    if value is None:
        return None
    aware = value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value
    return aware.astimezone(timezone.utc).isoformat()
