#!/usr/bin/env python3
"""Read-only offline updater rescue. Python standard library; no main app imports.

Local process-crash diagnosis only. Never switches a slot, adopts ownership,
replays an effect, migrates a journal or restores business state.

STABLE describes the selected executable slot and journal, not integrity of
every historical bundle/slot or cryptographic validity of retained signatures.
Historical preservation is tested with before/after byte inventories; this
reader is not a complete archive-integrity audit. Native execution separately
re-admits its current signed bundle using the protected external trust root.
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


def inspect_retained_pair(owned_root):
    """Understand the retained PAN464 v4 journal without loading PAN/KS/Node.

    This is deliberately observational: durable receipts are not a fresh native
    PostgreSQL/Superset readback and cannot authorize restore or new work.
    """
    root = Path(owned_root)
    require(root.is_absolute() and root.is_dir(), "PAIR_ROOT_REQUIRED")
    control = root/"pan464-owned-v1"/"pan453-owned-v2"
    pair_bytes = read(control/"pair-state.json")
    pair = decode(pair_bytes)
    phases = {"SOURCE_CREATING", "SOURCE_READY", "CHECKPOINTED", "MIGRATING", "NATIVE_STARTUP",
              "VALIDATING", "RESTORING", "REJECTED_RESTORED", "ACTIVATION_INTENT", "ACTIVE",
              "POST_ACTIVATION_WRITE_INTENT", "ACTIVE_WITH_NEW_WRITES"}
    require(isinstance(pair, dict) and pair.get("phase") in phases and
            isinstance(pair.get("edgeDigest"), str) and HEX.fullmatch(pair["edgeDigest"]), "PAIR_STATE_DENIED")
    effects_path = control/"effects.json"
    statuses = []
    effects_digest = None
    if effects_path.exists():
        raw = read(effects_path)
        effects_digest = sha(raw)
        journal = decode(raw)
        require(isinstance(journal, dict) and set(journal) == {"schemaVersion", "effects", "reservations", "consumedAuthorityLeases"} and
                journal["schemaVersion"] == "chimpmaera.demo/effect-store/v4", "PAIR_EFFECT_SCHEMA_DENIED")
        for key in ("effects", "reservations", "consumedAuthorityLeases"):
            require(isinstance(journal[key], dict), "PAIR_EFFECT_COLLECTION_DENIED")
        # This reader qualifies exactly the retained native updater operation,
        # not arbitrary application/HMAC/owner-escalation records.
        operation = "native:pan464-pair-v1"
        require(set(journal["reservations"]) <= {operation} and set(journal["effects"]) <= {operation} and
                not journal["consumedAuthorityLeases"], "PAIR_OPERATION_DENIED")
        for key, record in journal["reservations"].items():
            require(isinstance(record, dict) and set(record) == {"actionDigest", "authorityBinding", "authorityKind", "leaseId", "recovery", "reservedAtMs", "status"}, "PAIR_RESERVATION_DENIED")
            require(record["authorityKind"] == "INSTALLER_APPROVAL_V1" and record["leaseId"] is None and
                    record["status"] in ("EXECUTING", "APPLIED", "AMBIGUOUS") and
                    record["recovery"] == ("RECONCILE" if record["status"] == "AMBIGUOUS" else "NONE"), "PAIR_RESERVATION_STATE_DENIED")
            integer(record["reservedAtMs"])
            for field in ("actionDigest", "authorityBinding"):
                require(isinstance(record[field], str) and HEX.fullmatch(record[field]), "PAIR_AUTHORITY_BINDING_DENIED")
            require((record["status"] == "APPLIED") == (key in journal["effects"]), "PAIR_EFFECT_CONTRADICTION_DENIED")
            statuses.append(record["status"])
        for key, effect in journal["effects"].items():
            require(key in journal["reservations"] and isinstance(effect, dict) and
                    set(effect) == {"actionDigest", "providerResult", "readback", "receipt"}, "PAIR_RECEIPT_REQUIRED")
            receipt = effect["receipt"]
            require(isinstance(receipt, dict) and set(receipt) == {"schemaVersion", "replayKey", "actionDigest", "outcome", "readbackDigest", "checkpointDigest", "receiptDigest"}, "PAIR_RECEIPT_SCHEMA_DENIED")
            require(receipt["schemaVersion"] == "pansphaira.pan464/retained-pair-receipt/v1" and
                    receipt["replayKey"] == key and receipt["outcome"] == "LOCAL_RETAINED_PAIR_VERIFIED" and
                    receipt["actionDigest"] == effect["actionDigest"] == journal["reservations"][key]["actionDigest"], "PAIR_RECEIPT_BINDING_DENIED")
            for field in ("actionDigest", "readbackDigest", "checkpointDigest", "receiptDigest"):
                require(isinstance(receipt[field], str) and HEX.fullmatch(receipt[field]), "PAIR_RECEIPT_DIGEST_DENIED")
            core = {k:v for k,v in receipt.items() if k != "receiptDigest"}
            # This closed receipt has ASCII string values only; its bytes match
            # the existing sorted-key JS canonical JSON without numeric drift.
            require(sha(json.dumps(core, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()) == receipt["receiptDigest"], "PAIR_RECEIPT_CORRUPTED_DENIED")
    else:
        require(pair["phase"] in ("SOURCE_CREATING", "SOURCE_READY"), "PAIR_EFFECT_JOURNAL_MISSING_HELD")
    if pair["phase"] in ("ACTIVE", "POST_ACTIVATION_WRITE_INTENT", "ACTIVE_WITH_NEW_WRITES"):
        require(statuses == ["APPLIED"], "PAIR_ACTIVATION_CONTRADICTION_HELD")
    return {"schema":"pansphaira.retained-pair-rescue/v1", "outcome":"HELD_REQUIRES_NATIVE_READBACK",
            "phase":pair["phase"], "effectJournalSchema":"chimpmaera.demo/effect-store/v4" if effects_digest else None,
            "reservationStates":statuses, "pairStateSha256":sha(pair_bytes), "effectJournalSha256":effects_digest,
            "ownerLockPresent":(control/"operation.lock").exists(), "mutationPerformed":False,
            "nonclaims":["NO_MAIN_APPLICATION_IMPORT", "NO_FRESH_BUSINESS_READBACK", "NO_LOCK_ADOPTION", "NO_REPLAY_OR_RESTORE", "NO_POWER_LOSS_QUALIFICATION"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--root")
    group.add_argument("--retained-pair-root")
    args = parser.parse_args()
    try:
        result = inspect(args.root) if args.root else inspect_retained_pair(args.retained_pair_root)
    except (ValueError, OSError, TypeError, KeyError):
        print(json.dumps({"outcome":"UNKNOWN_HELD", "mutationPerformed":False}))
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
