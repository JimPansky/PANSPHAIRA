#!/usr/bin/env python3
"""Read-only offline updater rescue. Python standard library; no main app imports.

Local process-crash diagnosis only. Never switches a slot, adopts ownership,
replays an effect, migrates a journal or restores business state.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat

HEX = re.compile(r"[0-9a-f]{64}\Z")
PHASES = ("PREPARED", "SWITCH_INTENT", "SWITCHED", "MIGRATION_INTENT", "MIGRATED", "COMPLETED")
MAX_FILE = 1024 * 1024 * 1024


def require(value, code):
    if not value:
        raise ValueError(code)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)+"\n").encode()


def read(path, limit=4*1024*1024):
    path = Path(path)
    for part in (path, *path.parents):
        require(not part.is_symlink(), "SYMLINK_DENIED")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_size <= limit, "FILE_TYPE_OR_SIZE_DENIED")
        with os.fdopen(fd, "rb", closefd=False) as stream:
            result = stream.read(limit+1)
        require(len(result) <= limit, "FILE_SIZE_DENIED")
        return result
    finally:
        os.close(fd)


def decode(data):
    def pairs(items):
        value = {}
        for key, item in items:
            require(key not in value, "DUPLICATE_KEY_DENIED")
            value[key] = item
        return value
    return json.loads(data, object_pairs_hook=pairs,
                      parse_constant=lambda _: require(False, "NONFINITE_DENIED"))


def integer(value, minimum=0):
    require(type(value) is int and minimum <= value <= 9007199254740991, "INTEGER_DENIED")


def relative_path(value):
    require(isinstance(value, str) and len(value) <= 240 and value and
            not value.startswith("/") and "\\" not in value and "\x00" not in value and
            all(p not in ("", ".", "..") for p in value.split("/")) and
            str(PurePosixPath(value)) == value, "RELATIVE_PATH_DENIED")
    return value


def read_journal(root):
    directory = root / "journal"
    require(directory.is_dir() and not directory.is_symlink(), "JOURNAL_DIRECTORY_REQUIRED")
    entries = sorted(directory.iterdir())
    require(0 < len(entries) <= 10000, "JOURNAL_LENGTH_DENIED")
    previous = None
    records = []
    protocol = 1
    last_version = 0
    last_clock = 0
    operation = None
    previous_phase = None
    for ordinal, path in enumerate(entries, 1):
        require(path.name == f"{ordinal:020d}.json", "JOURNAL_SEQUENCE_DENIED")
        raw = read(path)
        value = decode(raw)
        require(isinstance(value, dict) and set(value) == {"schema", "previous", "record"}, "JOURNAL_SCHEMA_DENIED")
        require(value["schema"] in ("pansphaira.updater-journal/v1", "pansphaira.updater-journal/v2"), "JOURNAL_VERSION_DENIED")
        current_protocol = int(value["schema"][-1])
        require(current_protocol >= protocol, "JOURNAL_DOWNGRADE_DENIED")
        record = value["record"]
        expected = {"ordinal", "phase", "artifact", "version", "sourceCommit", "metadataSha256", "verifiedAt", "trustSha256", "slotManifestSha256"}
        require(isinstance(record, dict) and set(record) == expected, "JOURNAL_RECORD_DENIED")
        integer(record["ordinal"], 1)
        require(record["ordinal"] == ordinal and value["previous"] == previous, "JOURNAL_CHAIN_DENIED")
        require(record["phase"] in PHASES, "JOURNAL_PHASE_DENIED")
        for field in ("artifact", "metadataSha256", "trustSha256", "slotManifestSha256"):
            require(isinstance(record[field], str) and HEX.fullmatch(record[field]), "JOURNAL_DIGEST_DENIED")
        require(isinstance(record["sourceCommit"], str) and re.fullmatch(r"[0-9a-f]{40}", record["sourceCommit"]), "JOURNAL_SOURCE_DENIED")
        integer(record["version"], 1)
        integer(record["verifiedAt"])
        require(record["verifiedAt"] >= last_clock, "JOURNAL_CLOCK_DENIED")
        if record["phase"] == "PREPARED":
            require(previous_phase in (None, "COMPLETED") and record["version"] > last_version, "JOURNAL_NEW_OPERATION_DENIED")
            operation = {k:record[k] for k in expected - {"ordinal", "phase", "verifiedAt"}}
        else:
            require(operation == {k:record[k] for k in expected - {"ordinal", "phase", "verifiedAt"}}, "JOURNAL_OPERATION_DRIFT_DENIED")
            require(previous_phase is not None and PHASES.index(record["phase"]) == PHASES.index(previous_phase)+1, "JOURNAL_PHASE_ORDER_DENIED")
        if current_protocol > protocol:
            require(record["phase"] == "MIGRATED", "JOURNAL_MIGRATION_BOUNDARY_DENIED")
        protocol = current_protocol
        previous = sha(raw)
        records.append({"digest":previous, "protocol":protocol, **record})
        last_version = record["version"]
        last_clock = record["verifiedAt"]
        previous_phase = record["phase"]
    return records


def check_slot(root, artifact, manifest_digest):
    require(HEX.fullmatch(artifact), "SLOT_ID_DENIED")
    slot = root / "slots" / artifact
    data = read(slot / "slot-manifest.json")
    require(sha(data) == manifest_digest, "SLOT_MANIFEST_DENIED")
    manifest = decode(data)
    require(isinstance(manifest, dict) and set(manifest) == {"schema", "files"} and
            manifest["schema"] == "pansphaira.updater-slot/v1" and
            isinstance(manifest["files"], dict) and 0 < len(manifest["files"]) <= 10000,
            "SLOT_MANIFEST_SCHEMA_DENIED")
    expected = set(manifest["files"]) | {"slot-manifest.json"}
    actual = set()
    for path in slot.rglob("*"):
        require(not path.is_symlink(), "SLOT_SYMLINK_DENIED")
        if path.is_file():
            actual.add(path.relative_to(slot).as_posix())
        else:
            require(path.is_dir(), "SLOT_SPECIAL_FILE_DENIED")
    require(actual == expected, "SLOT_FILESET_DENIED")
    for name, item in manifest["files"].items():
        relative_path(name)
        require(isinstance(item, dict) and set(item) == {"sha256", "size", "mode"}, "SLOT_ENTRY_DENIED")
        data = read(slot / name, MAX_FILE)
        require(len(data) == item["size"] and sha(data) == item["sha256"] and
                stat.S_IMODE((slot/name).stat().st_mode) == item["mode"], "SLOT_BYTES_DENIED")
    require("scripts/offline-updater.py" in expected and "scripts/offline-artifact.py" in expected and
            "scripts/offline-rescue.py" in expected, "SLOT_ENTRYPOINT_REQUIRED")
    return manifest


def inspect(root):
    root = Path(root)
    require(root.is_absolute() and root.is_dir() and not root.is_symlink(), "OWNED_ROOT_REQUIRED")
    records = read_journal(root)
    latest = records[-1]
    require(sha(read(root/"trust.json")) == latest["trustSha256"], "TRUST_CHANGED_DENIED")
    check_slot(root, latest["artifact"], latest["slotManifestSha256"])
    current = root / "current"
    require(not os.path.lexists(current) or current.is_symlink(), "ACTIVE_POINTER_TYPE_DENIED")
    active = os.readlink(current) if current.is_symlink() else None
    require(active is None or re.fullmatch(r"slots/[0-9a-f]{64}", active), "ACTIVE_POINTER_DENIED")
    selected = active == "slots/"+latest["artifact"]
    if active is not None and not selected:
        prior = next((r for r in reversed(records) if r["phase"] == "COMPLETED" and "slots/"+r["artifact"] == active), None)
        if prior is None:
            raise ValueError("UNKNOWN_ACTIVE_SLOT_DENIED")
        check_slot(root, prior["artifact"], prior["slotManifestSha256"])
    completed = latest["phase"] == "COMPLETED"
    require(not completed or selected, "COMPLETED_POINTER_DRIFT_DENIED")
    if latest["protocol"] == 2:
        migration = read(root/"journal-v2.json")
        old = [{"ordinal":r["ordinal"], "sha256":r["digest"]} for r in records if r["protocol"] == 1]
        require(decode(migration) == {"schema":"pansphaira.updater-journal-index/v2", "retainedV1":old}, "MIGRATED_INDEX_DENIED")
    return {"schema":"pansphaira.updater-rescue/v1", "outcome":"STABLE" if completed else "HELD_NO_AUTOMATIC_RESTORE",
            "phase":latest["phase"], "journalProtocol":latest["protocol"], "records":len(records),
            "journalHeadSha256":latest["digest"], "operation":latest["metadataSha256"],
            "highestReservedVersion":max(r["version"] for r in records),
            "lastVerifiedTime":max(r["verifiedAt"] for r in records),
            "targetArtifact":latest["artifact"], "targetSelected":selected,
            "activeArtifact":None if active is None else active.split("/")[1],
            "mutationPerformed":False, "businessStateInspected":False,
            "nonclaims":["NO_MAIN_APPLICATION_IMPORT", "NO_BUSINESS_REPLAY_OR_RESTORE", "NO_POWER_LOSS_QUALIFICATION"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True)
    args = parser.parse_args()
    try:
        result = inspect(args.root)
    except (ValueError, OSError, TypeError, KeyError):
        print(json.dumps({"outcome":"UNKNOWN_HELD", "mutationPerformed":False}))
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
