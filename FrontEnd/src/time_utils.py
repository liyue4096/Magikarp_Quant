from datetime import datetime, timezone
from zoneinfo import ZoneInfo

ET_TZ = ZoneInfo("America/New_York")


def to_iso_utc(ts):
    if ts is None:
        return None
    ts_s = ts / 1000 if ts > 1e12 else ts
    return datetime.fromtimestamp(ts_s, tz=timezone.utc).isoformat()


def to_iso_et(ts):
    if ts is None:
        return None
    ts_s = ts / 1000 if ts > 1e12 else ts
    return datetime.fromtimestamp(ts_s, tz=timezone.utc).astimezone(ET_TZ).isoformat()