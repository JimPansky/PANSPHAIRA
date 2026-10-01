#!/usr/bin/env python3
"""Owned local offline updater: signed immutable executable slots, no app deployment.

The local owner and the protected root are trusted. No host sandbox, network
fetch, main-application effect, automatic rollback or power-loss claim.
"""
import argparse
import fcntl
import io
import json
import os
from pathlib import Path
import runpy
import signal
import stat
import subprocess
import sys
import tarfile
import uuid
from types import SimpleNamespace

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
A = SimpleNamespace(**runpy.run_path(str(HERE / "offline-artifact.py")))
R = SimpleNamespace(**runpy.run_path(str(HERE / "offline-rescue.py")))
JOURNAL_PROTOCOL = 2


def sync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def create(path, data, mode=0o444):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    try:
        with os.fdopen(fd, "wb", closefd=False) as stream:
            stream.write(data)
            stream.flush()
        os.fchmod(fd, mode)
        os.fsync(fd)
    finally:
        os.close(fd)
    sync_dir(path.parent)


def owned_root(root):
    root = Path(root)
    A.require(root.is_absolute() and root.is_dir(), "ROOT_REQUIRED")
    for part in (root, *root.parents):
        A.require(not part.is_symlink(), "ROOT_SYMLINK_DENIED")
    info = root.stat()
    A.require(info.st_uid == os.getuid() and stat.S_IMODE(info.st_mode) == 0o700, "PRIVATE_OWNED_ROOT_REQUIRED")
    return root


def lock(root):
    path = root / "updater.lock"
    inherited = os.environ.pop("PAN465_LOCK_FD", None)
    if inherited is not None:
        A.require(inherited.isdigit(), "LOCK_DESCRIPTOR_DENIED")
        fd = int(inherited)
    else:
        fd = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    info = os.fstat(fd)
    A.require(stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid() and info.st_nlink == 1 and
              (info.st_dev, info.st_ino) == (path.stat().st_dev, path.stat().st_ino), "LOCK_IDENTITY_DENIED")
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        os.close(fd)
        raise ValueError("COMPETING_UPDATER_DENIED") from None
    os.set_inheritable(fd, True)
    return fd


def phase_pause(args, phase):
    if args.pause_at == phase:
        A.require(args.local_synthetic_qualification, "QUALIFICATION_SCOPE_REQUIRED")
        print(json.dumps({"qualificationBoundary":phase}), flush=True)
        os.kill(os.getpid(), signal.SIGSTOP)


def archive_slot(root, bundle, receipt):
    artifact = receipt["metadata"]["sha256"]
    data = A.regular(Path(bundle)/"artifact.tar", 256*A.LIMIT)
    A.require(A.digest(data) == artifact, "VERIFIED_ARCHIVE_CHANGED_DENIED")
    files = {}
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:") as archive:
        entries = archive.getmembers()
        A.require(0 < len(entries) <= 10000, "ARCHIVE_COUNT_DENIED")
        total = 0
        for item in entries:
            R.relative_path(item.name)
            A.require(item.isfile() and item.name not in files and item.name != "slot-manifest.json" and
                      ".git" not in item.name.split("/") and item.size <= 64*A.LIMIT and
                      not item.pax_headers and item.mode & 0o7000 == 0, "ARCHIVE_ENTRY_DENIED")
            total += item.size
            A.require(total <= 256*A.LIMIT, "ARCHIVE_TOTAL_DENIED")
            stream = archive.extractfile(item)
            A.require(stream is not None, "ARCHIVE_CONTENT_REQUIRED")
            if stream is None:
                raise ValueError("ARCHIVE_CONTENT_REQUIRED")
            content = stream.read(item.size+1)
            A.require(len(content) == item.size, "ARCHIVE_CONTENT_DENIED")
            files[item.name] = content
    required = {"scripts/offline-updater.py", "scripts/offline-artifact.py", "scripts/offline-rescue.py"}
    A.require(required <= set(files), "RUNNABLE_UPDATER_REQUIRED")
    manifest = {"schema":"pansphaira.updater-slot/v1", "files":{
        name:{"sha256":R.sha(content), "size":len(content), "mode":0o444}
        for name, content in sorted(files.items())}}
    manifest_bytes = R.encoded(manifest)
    slot = root/"slots"/artifact
    if slot.exists():
        R.check_slot(root, artifact, R.sha(manifest_bytes))
        return R.sha(manifest_bytes)
    stage = root/"staging"/str(uuid.uuid4())
    stage.mkdir(mode=0o700)
    for name, content in files.items():
        path = stage/name
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        create(path, content)
    create(stage/"slot-manifest.json", manifest_bytes)
    for directory in sorted([p for p in stage.rglob("*") if p.is_dir()], reverse=True):
        sync_dir(directory)
    sync_dir(stage)
    os.rename(stage, slot)
    sync_dir(root/"slots")
    return R.sha(manifest_bytes)


def retain_bundle(root, bundle, receipt):
    # Retain exact signature + metadata, including separate signatures of the
    # same payload. Historical inputs are never updated in place.
    target = root/"bundles"/receipt["metadataSha256"]
    A.require(not target.exists(), "BUNDLE_HISTORY_OVERWRITE_DENIED")
    target.mkdir(mode=0o700)
    for name in ("artifact.tar", "artifact.json", "artifact.sig"):
        limit = 256*A.LIMIT if name == "artifact.tar" else A.LIMIT
        create(target/name, A.regular(Path(bundle)/name, limit))
    sync_dir(target)
    sync_dir(target.parent)
    # Verify the retained inputs, not just the earlier caller-owned paths.
    retained = A.admit(target, root/"trust.json", receipt["metadata"]["version"]-1, receipt["verifiedAt"])
    A.require(retained["metadataSha256"] == receipt["metadataSha256"] and
              retained["metadata"]["sha256"] == receipt["metadata"]["sha256"], "RETAINED_INPUT_CHANGED_DENIED")


def append(root, record, protocol):
    entries = sorted((root/"journal").iterdir())
    previous = R.sha(R.read(entries[-1])) if entries else None
    value = {"schema":f"pansphaira.updater-journal/v{protocol}", "previous":previous,
             "record":{**record, "ordinal":len(entries)+1}}
    create(root/"journal"/f"{len(entries)+1:020d}.json", R.encoded(value))


def current_record(root):
    latest = R.read_journal(root)[-1]
    return {k:v for k,v in latest.items() if k not in ("digest", "protocol")}, latest["protocol"]


def switch_and_exec(root, args, fd):
    record, protocol = current_record(root)
    A.require(record["metadataSha256"] == args.operation, "EXACT_OPERATION_REQUIRED")
    if record["phase"] == "PREPARED":
        record["phase"] = "SWITCH_INTENT"
        append(root, record, protocol)
    if record["phase"] == "SWITCH_INTENT":
        phase_pause(args, "BEFORE_SWITCH")
        target = "slots/"+record["artifact"]
        pointer = root/"current"
        if not pointer.is_symlink() or os.readlink(pointer) != target:
            temporary = root/("current-"+str(uuid.uuid4()))
            temporary.symlink_to(target)
            os.replace(temporary, pointer)
            sync_dir(root)
        phase_pause(args, "AFTER_SWITCH")
        record["phase"] = "SWITCHED"
        append(root, record, protocol)
    R.inspect(root)
    # The actual newly selected executable completes the transition, retaining
    # the same kernel lock across exec. It is NOT a version-label-only switch.
    executable = root/"slots"/record["artifact"]/"scripts/offline-updater.py"
    env = {"PATH":"/usr/bin:/bin", "PYTHONDONTWRITEBYTECODE":"1", "PAN465_LOCK_FD":str(fd)}
    command = [sys.executable, "-B", str(executable), "finish", "--root", str(root), "--operation", args.operation]
    if args.pause_at:
        command += ["--pause-at", args.pause_at, "--local-synthetic-qualification"]
    os.execve(sys.executable, command, env)


def migrate_journal(root, args, protocol):
    A.require(protocol in (1, 2), "JOURNAL_PROTOCOL_DENIED")
    if protocol == 2:
        # Already migrated: retain the exact historical index and all v1 bytes.
        return 2
    records = R.read_journal(root)
    data = R.encoded({"schema":"pansphaira.updater-journal-index/v2", "retainedV1":[
        {"ordinal":r["ordinal"], "sha256":r["digest"]} for r in records if r["protocol"] == 1]})
    index = root/"journal-v2.json"
    if index.exists():
        A.require(R.read(index) == data, "PRIOR_MIGRATION_INDEX_DENIED")
        return 2
    directory = root/"journal-migrations"
    directory.mkdir(mode=0o700, exist_ok=True)
    A.require(not directory.is_symlink(), "MIGRATION_DIRECTORY_DENIED")
    # Partial migration writes survive a real process kill and are never
    # overwritten or deleted by rescue/resume. Publication is create-only.
    temporary = directory/(str(uuid.uuid4())+".partial")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        midpoint = len(data)//2
        with os.fdopen(fd, "wb", closefd=False) as stream:
            stream.write(data[:midpoint])
            stream.flush()
            os.fsync(fd)
            sync_dir(directory)
            phase_pause(args, "DURING_JOURNAL_MIGRATION")
            stream.write(data[midpoint:])
            stream.flush()
        os.fchmod(fd, 0o444)
        os.fsync(fd)
    finally:
        os.close(fd)
    # A hard link publishes exactly the fsynced bytes without replacing an
    # existing journal/index. Both complete and interrupted records stay intact.
    os.link(temporary, index, follow_symlinks=False)
    sync_dir(root)
    return 2


def finish(root, args):
    record, protocol = current_record(root)
    A.require(record["metadataSha256"] == args.operation and record["phase"] in
              ("SWITCHED", "MIGRATION_INTENT", "MIGRATED"), "FINISH_PHASE_DENIED")
    A.require(os.readlink(root/"current") == "slots/"+record["artifact"], "FINISH_SLOT_DENIED")
    A.require(Path(__file__).resolve() == root/"slots"/record["artifact"]/"scripts/offline-updater.py", "SELECTED_EXECUTABLE_REQUIRED")
    A.require(protocol <= JOURNAL_PROTOCOL, "EXECUTABLE_JOURNAL_DOWNGRADE_DENIED")
    if record["phase"] == "SWITCHED":
        record["phase"] = "MIGRATION_INTENT"
        append(root, record, protocol)
    if record["phase"] == "MIGRATION_INTENT":
        protocol = migrate_journal(root, args, protocol)
        record["phase"] = "MIGRATED"
        append(root, record, protocol)
    record["phase"] = "COMPLETED"
    append(root, record, protocol)
    return R.inspect(root)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("init", "apply", "resume", "finish", "status", "launch", "run-native-profile"))
    parser.add_argument("--root", required=True)
    parser.add_argument("--bundle")
    parser.add_argument("--trust")
    parser.add_argument("--operation")
    parser.add_argument("--owned-root")
    parser.add_argument("--permission-file")
    parser.add_argument("--output")
    parser.add_argument("--pause-at", choices=("BEFORE_SWITCH", "AFTER_SWITCH", "DURING_JOURNAL_MIGRATION"))
    parser.add_argument("--local-synthetic-qualification", action="store_true")
    args = parser.parse_args()
    fd = None
    try:
        root = owned_root(args.root)
        A.require(not args.pause_at or args.local_synthetic_qualification, "QUALIFICATION_SCOPE_REQUIRED")
        if args.command == "status":
            result = R.inspect(root)
        else:
            if args.command == "init":
                A.require(args.bundle and args.trust and not list(root.iterdir()), "EMPTY_ROOT_AND_EXTERNAL_TRUST_REQUIRED")
                receipt = A.admit(args.bundle, args.trust, 0, 0)
                fd = lock(root)
                for name in ("slots", "staging", "bundles", "journal"):
                    (root/name).mkdir(mode=0o700)
                create(root/"trust.json", A.regular(Path(args.trust)))
                slot_digest = archive_slot(root, args.bundle, receipt)
                retain_bundle(root, args.bundle, receipt)
                record = {"ordinal":1, "phase":"PREPARED", "artifact":receipt["metadata"]["sha256"],
                          "version":receipt["metadata"]["version"], "sourceCommit":receipt["metadata"]["sourceCommit"],
                          "metadataSha256":receipt["metadataSha256"], "verifiedAt":receipt["verifiedAt"],
                          "trustSha256":R.sha(R.read(root/"trust.json")), "slotManifestSha256":slot_digest}
                append(root, record, 1)
                args.operation = receipt["metadataSha256"]
                switch_and_exec(root, args, fd)
            fd = fd if fd is not None else lock(root)
            observed = R.inspect(root)
            if args.command == "run-native-profile":
                A.require(observed["outcome"] == "STABLE" and args.owned_root and args.permission_file and args.output
                          and not any((args.bundle,args.trust,args.operation,args.pause_at)), "NATIVE_PROFILE_ARGUMENTS_REQUIRED")
                executable = root/"slots"/observed["activeArtifact"]/"scripts/offline-native-profile.py"
                A.require(executable.is_file(), "NATIVE_PROFILE_NOT_IN_SELECTED_ARTIFACT")
                env = {k:os.environ[k] for k in ("PATH","HOME","TMPDIR") if k in os.environ}
                env.update(PAN465_LOCK_FD=str(fd),PYTHONDONTWRITEBYTECODE="1")
                os.execve(sys.executable,[sys.executable,"-B",str(executable),"--root",str(root),
                    "--owned-root",args.owned_root,"--permission-file",args.permission_file,"--output",args.output],env)
            if args.command == "launch":
                A.require(observed["outcome"] == "STABLE", "INCOMPLETE_OPERATION_HELD")
                executable = root/"slots"/observed["activeArtifact"]/"scripts/offline-updater.py"
                # Launch the selected updater's actual status entry, not an
                # arbitrary bundle command or caller-selected executable.
                os.execve(sys.executable, [sys.executable,"-B",str(executable),"status","--root",str(root)],
                          {"PATH":"/usr/bin:/bin", "PYTHONDONTWRITEBYTECODE":"1"})
            if args.command == "apply":
                A.require(observed["outcome"] == "STABLE" and args.bundle and not args.trust, "STABLE_ROOT_REQUIRED")
                receipt = A.admit(args.bundle, root/"trust.json", observed["highestReservedVersion"], observed["lastVerifiedTime"])
                slot_digest = archive_slot(root, args.bundle, receipt)
                retain_bundle(root, args.bundle, receipt)
                record = {"ordinal":observed["records"]+1, "phase":"PREPARED", "artifact":receipt["metadata"]["sha256"],
                          "version":receipt["metadata"]["version"], "sourceCommit":receipt["metadata"]["sourceCommit"],
                          "metadataSha256":receipt["metadataSha256"], "verifiedAt":receipt["verifiedAt"],
                          "trustSha256":R.sha(R.read(root/"trust.json")), "slotManifestSha256":slot_digest}
                append(root, record, observed["journalProtocol"])
                args.operation = receipt["metadataSha256"]
                switch_and_exec(root, args, fd)
            A.require(args.command in ("resume", "finish") and args.operation == observed["operation"] and
                      observed["outcome"] != "STABLE" and not args.bundle and not args.trust, "RESUME_EXACT_PENDING_OPERATION_REQUIRED")
            # Recheck the retained signature, expiration, key/tool identity and
            # installed high water; a caller cannot lower the installed floor.
            receipt = A.admit(root/"bundles"/args.operation, root/"trust.json",
                              observed["highestReservedVersion"]-1, observed["lastVerifiedTime"])
            A.require(receipt["metadataSha256"] == args.operation, "RETAINED_METADATA_CHANGED_DENIED")
            if args.command == "resume":
                switch_and_exec(root, args, fd)
            result = finish(root, args)
        print(json.dumps(result, sort_keys=True))
        return 0
    except (ValueError, OSError, TypeError, KeyError, tarfile.TarError, subprocess.SubprocessError):
        print(json.dumps({"outcome":"DENIED_OR_HELD", "automaticRestore":False}))
        return 1
    finally:
        if fd is not None:
            os.close(fd)


if __name__ == "__main__":
    raise SystemExit(main())
