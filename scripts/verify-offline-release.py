#!/usr/bin/env python3
"""Verify a closed offline distribution against EXTERNAL digest and trust.

No archive-supplied key is adopted. No installation, native effects or semantic
release approval follows from integrity verification. Output is create-only.
"""
import argparse
import io
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
import tarfile
import tempfile
from types import SimpleNamespace

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
A = SimpleNamespace(**runpy.run_path(str(HERE / "offline-artifact.py")))
R = SimpleNamespace(**runpy.run_path(str(HERE / "offline-rescue.py")))
PAYLOAD = {"scripts/" + n for n in ("offline-artifact.py", "offline-rescue.py",
                                   "offline-updater.py", "offline-native-profile.py")}
PAYLOAD |= {f"bundles/{kind}/{file}" for kind in ("baseline", "native")
            for file in ("artifact.tar", "artifact.json", "artifact.sig")}
PAYLOAD |= {"release-public.pem", "docs/offline-profile.txt", "receipts/native-execution.json"}
MEMBERS = PAYLOAD | {"distribution.json", "SHA256SUMS"}


def contents(data):
    files = {}
    total = 0
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
        for member in archive:
            total += member.size
            A.require(total <= 512 * 1024 * 1024, "DISTRIBUTION_TOTAL_DENIED")
            R.relative_path(member.name)
            A.require(member.isfile() and member.name in MEMBERS and member.name not in files and
                      not member.pax_headers and member.mode == 0o644 and
                      0 <= member.size <= 256 * A.LIMIT, "DISTRIBUTION_MEMBER_DENIED")
            stream = archive.extractfile(member)
            if stream is None:
                raise ValueError("DISTRIBUTION_FILE_REQUIRED")
            value = stream.read(member.size + 1)
            A.require(len(value) == member.size, "DISTRIBUTION_TRUNCATED")
            files[member.name] = value
    A.require(set(files) == MEMBERS, "DISTRIBUTION_MEMBERSHIP_DENIED")
    declaration = A.strict_json(files["distribution.json"])
    A.require(declaration["schema"] == "pansphaira.offline-distribution/v1" and
              declaration["profile"] == "PAN465_OFFLINE_RETAINED_NATIVE" and
              declaration["productionAuthority"] is False, "DISTRIBUTION_SCOPE_DENIED")
    A.require(isinstance(declaration["files"], dict) and set(declaration["files"]) == PAYLOAD,
              "DISTRIBUTION_INVENTORY_DENIED")
    for name, identity in declaration["files"].items():
        A.keys(identity, ("sha256", "size"))
        A.require(identity["sha256"] == A.digest(files[name]) and identity["size"] == len(files[name]),
                  "DISTRIBUTION_BYTES_DENIED")
    expected_sums = "".join(f"{A.digest(files[n])}  {n}\n" for n in sorted(MEMBERS - {"SHA256SUMS"})).encode()
    A.require(files["SHA256SUMS"] == expected_sums, "DISTRIBUTION_CHECKSUMS_DENIED")
    return files, declaration


def verify(args):
    A.require(isinstance(args.sha256, str) and A.HEX.fullmatch(args.sha256), "EXTERNAL_ARCHIVE_DIGEST_REQUIRED")
    archive = Path(args.archive)
    data = A.regular(archive, 256 * A.LIMIT)
    A.require(A.digest(data) == args.sha256, "EXTERNAL_ARCHIVE_BYTES_DENIED")
    files, declaration = contents(data)
    trust = Path(args.trust)
    protected = A.strict_json(A.regular(trust))
    A.require(protected["releaseKeySha256"] == declaration["releasePublicKeySha256"] ==
              A.digest(files["release-public.pem"]), "EXTERNAL_KEY_BINDING_DENIED")
    with tempfile.TemporaryDirectory(prefix="pan465-distribution-", dir=os.environ.get("TMPDIR")) as temporary:
        stage = Path(temporary).resolve()
        verified = {}
        for kind in ("baseline", "native"):
            bundle = stage / kind
            bundle.mkdir(mode=0o700)
            for filename in ("artifact.tar", "artifact.json", "artifact.sig"):
                (bundle / filename).write_bytes(files[f"bundles/{kind}/{filename}"])
            verified[kind] = A.admit(bundle, trust, 0, 0)
        old, new = (verified[k]["metadata"] for k in ("baseline", "native"))
        A.require(old["version"] == 1 and new["version"] == 2 and
                  old["sha256"] == declaration["baselineArtifactSha256"] and
                  new["sha256"] == declaration["nativeArtifactSha256"] and
                  new["sourceCommit"] == declaration["sourceCommit"] and
                  verified["native"]["metadataSha256"] == declaration["metadataSha256"],
                  "DISTRIBUTION_SIGNATURE_ASSOCIATION_DENIED")
    # Bootstrap wrappers must be the same bytes as the admitted signed native
    # payload, not a separately substituted executable alongside valid bundles.
    native_files = {}
    with tarfile.open(fileobj=io.BytesIO(files["bundles/native/artifact.tar"]), mode="r:") as native_archive:
        for item in native_archive:
            if item.name.startswith("scripts/"):
                A.require(item.name not in native_files and item.isfile(), "SIGNED_WRAPPER_MEMBER_DENIED")
                stream = native_archive.extractfile(item)
                if stream is None:
                    raise ValueError("SIGNED_WRAPPER_REQUIRED")
                native_files[item.name] = stream.read(item.size + 1)
    for name in PAYLOAD:
        if name.startswith("scripts/"):
            A.require(native_files.get(name) == files[name], "SIGNED_BOOTSTRAP_BYTES_DENIED")
    receipt = A.strict_json(files["receipts/native-execution.json"])
    A.require(receipt["outcome"] == "PASS" and receipt["nativeExit"] == 0 and
              receipt["artifactSha256"] == declaration["nativeArtifactSha256"] and
              receipt["metadataSha256"] == declaration["metadataSha256"], "DISTRIBUTION_RECEIPT_DENIED")
    output = Path(args.output)
    A.require(output.is_absolute() and not output.exists() and output.parent.resolve() == output.parent,
              "NEW_ABSOLUTE_OUTPUT_REQUIRED")
    output.mkdir(mode=0o700)
    for name, value in sorted(files.items()):
        path = output / name
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        with path.open("xb") as stream:
            stream.write(value)
        path.chmod(0o444)
    return {"outcome": "OFFLINE_DISTRIBUTION_VERIFIED_NOT_INSTALLED", "archiveSha256": args.sha256,
            "sourceCommit": declaration["sourceCommit"], "files": len(files),
            "externalTrustUsed": True, "executionAuthorized": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("archive", "sha256", "trust", "output"):
        parser.add_argument("--" + name, required=True)
    try:
        result = verify(parser.parse_args())
    except (ValueError, OSError, TypeError, KeyError, subprocess.SubprocessError, tarfile.TarError):
        print(json.dumps({"outcome": "DISTRIBUTION_DENIED", "executionAuthorized": False}))
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
