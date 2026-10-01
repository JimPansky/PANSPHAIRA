#!/usr/bin/env python3
"""Offline artifact admission using OpenSSL signatures, not a new crypto scheme.

The operator supplies a protected trust root OUTSIDE the untrusted bundle.
Admission verifies bytes only; it does not authorize execution or installation.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import stat
import subprocess
import time

LIMIT = 4 * 1024 * 1024
HEX = re.compile(r"[0-9a-f]{64}\Z")


def require(value, code):
    if not value:
        raise ValueError(code)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def regular(path, limit=LIMIT):
    path = Path(path)
    require(path.is_absolute(), "ABSOLUTE_PATH_REQUIRED")
    for entry in (path, *path.parents):
        require(not entry.is_symlink(), "SYMLINK_DENIED")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_size <= limit,
                "REGULAR_BOUNDED_FILE_REQUIRED")
        with os.fdopen(fd, "rb", closefd=False) as stream:
            data = stream.read(limit + 1)
        require(len(data) <= limit, "FILE_LIMIT_DENIED")
        return data
    finally:
        os.close(fd)


def strict_json(data):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, "DUPLICATE_JSON_KEY_DENIED")
            result[key] = value
        return result
    return json.loads(data, object_pairs_hook=pairs,
                      parse_constant=lambda _: require(False, "NONFINITE_JSON_DENIED"))


def keys(value, expected):
    require(isinstance(value, dict) and set(value) == set(expected), "SCHEMA_DENIED")


def integer(value, minimum=0):
    require(type(value) is int and minimum <= value <= 9007199254740991,
            "INTEGER_DENIED")
    return value


def admit(bundle, trust_path, minimum_version, last_verified_time):
    """Verify a fixed three-file bundle. No network and no state changes."""
    bundle = Path(bundle)
    trust_path = Path(trust_path)
    require(bundle.is_absolute() and bundle.is_dir() and not bundle.is_symlink(),
            "BUNDLE_DIRECTORY_REQUIRED")
    require(bundle not in trust_path.parents, "EXTERNAL_TRUST_ROOT_REQUIRED")
    trust = strict_json(regular(trust_path))
    keys(trust, ("schema", "profile", "openssl", "opensslSha256", "releaseKey",
                 "releaseKeySha256", "minimumVersion"))
    require(trust["schema"] == "pansphaira.offline-trust/v1", "TRUST_SCHEMA_DENIED")
    require(trust["profile"] == "local-retained-pair", "PROFILE_DENIED")
    integer(trust["minimumVersion"], 1)
    integer(minimum_version)
    integer(last_verified_time)
    require(HEX.fullmatch(trust["opensslSha256"]) and HEX.fullmatch(trust["releaseKeySha256"]),
            "TRUST_DIGEST_DENIED")
    require(digest(regular(trust["openssl"], 32 * LIMIT)) == trust["opensslSha256"],
            "VERIFIER_IDENTITY_DENIED")
    require(digest(regular(trust["releaseKey"])) == trust["releaseKeySha256"],
            "RELEASE_KEY_IDENTITY_DENIED")
    # Signature covers the exact stored metadata bytes. OpenSSL is invoked by
    # absolute operator-pinned path with no inherited provider/config variables.
    metadata_path = bundle / "artifact.json"
    signature_path = bundle / "artifact.sig"
    metadata_bytes = regular(metadata_path)
    signature = regular(signature_path, 16384)
    require(len(signature) > 0, "SIGNATURE_REQUIRED")
    result = subprocess.run([trust["openssl"], "dgst", "-sha256", "-verify",
                             trust["releaseKey"], "-signature", str(signature_path),
                             str(metadata_path)],
                            env={"PATH": "/usr/bin:/bin", "OPENSSL_CONF": os.devnull},
                            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, timeout=15)
    require(result.returncode == 0, "RELEASE_SIGNATURE_DENIED")
    # Detect changed input around the external verifier; hostile concurrent
    # mutation by the admitted local owner remains outside this trust model.
    require(regular(metadata_path) == metadata_bytes and regular(signature_path, 16384) == signature,
            "SIGNATURE_INPUT_CHANGED_DENIED")
    metadata = strict_json(metadata_bytes)
    keys(metadata, ("schema", "profile", "role", "version", "issuedAt", "expiresAt",
                    "artifact", "sha256", "size", "sourceCommit", "entrypoint"))
    require(metadata["schema"] == "pansphaira.offline-artifact/v1", "METADATA_SCHEMA_DENIED")
    require(metadata["profile"] == trust["profile"] and metadata["role"] == "release",
            "SIGNER_ROLE_DENIED")
    version = integer(metadata["version"], 1)
    require(version >= trust["minimumVersion"] and version > minimum_version,
            "ROLLBACK_DENIED")
    issued = integer(metadata["issuedAt"])
    expires = integer(metadata["expiresAt"])
    now = math.floor(time.time())
    require(now >= last_verified_time, "CLOCK_ROLLBACK_DENIED")
    require(issued <= now < expires and issued < expires, "METADATA_TIME_DENIED")
    require(metadata["artifact"] == "artifact.tar" and
            metadata["entrypoint"] == "scripts/offline-updater.py", "ARTIFACT_NAME_DENIED")
    require(re.fullmatch(r"[0-9a-f]{40}", metadata["sourceCommit"]) and
            HEX.fullmatch(metadata["sha256"]), "ARTIFACT_IDENTITY_DENIED")
    size = integer(metadata["size"], 1)
    require(size <= 256 * LIMIT, "ARTIFACT_SIZE_DENIED")
    artifact = regular(bundle / metadata["artifact"], 256 * LIMIT)
    require(len(artifact) == size and digest(artifact) == metadata["sha256"],
            "ARTIFACT_BYTES_DENIED")
    return {"outcome": "OFFLINE_BYTES_VERIFIED_NOT_EXECUTED", "metadata": metadata,
            "metadataSha256": digest(metadata_bytes), "verifiedAt": now,
            "verifierSha256": trust["opensslSha256"], "releaseKeySha256": trust["releaseKeySha256"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", required=True)
    parser.add_argument("--trust", required=True)
    parser.add_argument("--minimum-version", type=int, required=True)
    parser.add_argument("--last-verified-time", type=int, required=True)
    args = parser.parse_args()
    try:
        receipt = admit(args.bundle, args.trust, args.minimum_version, args.last_verified_time)
    except (ValueError, OSError, TypeError, KeyError, subprocess.SubprocessError):
        # No path/key/material disclosure from malformed inputs.
        print(json.dumps({"outcome": "DENIED", "executionAuthorized": False}))
        return 1
    print(json.dumps(receipt, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
