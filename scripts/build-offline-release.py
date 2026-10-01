#!/usr/bin/env python3
"""Closed PAN465 distribution from signed real bundles and observed receipts.

No private key, grant, trust.json, installation or arbitrary evidence directory
is copied. The protected operator trust root stays outside the distribution.
This composition gate does not grant semantic acceptance or production authority.
"""
import argparse
import gzip
import io
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
import tarfile
from types import SimpleNamespace

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
A = SimpleNamespace(**runpy.run_path(str(HERE / "offline-artifact.py")))
B = SimpleNamespace(**runpy.run_path(str(HERE / "build-offline-native-profile.py")))
R = B.R
BUNDLE_FILES = ("artifact.tar", "artifact.json", "artifact.sig")
BASELINE_FILES = ("offline-artifact.py", "offline-rescue.py", "offline-updater.py")
NONCLAIMS = ["LOCAL_SYNTHETIC_ONLY", "EXTERNAL_OPERATOR_TRUST_REQUIRED",
             "PRELOADED_IMAGE_PREREQUISITE", "NO_PRODUCTION_OR_HOST_SANDBOX",
             "NO_REGISTRY_SIGNATURE_ASSERTION", "NO_POWER_LOSS_QUALIFICATION",
             "RESCUE_STABLE_IS_NOT_A_WHOLE_HISTORY_SIGNATURE_AUDIT"]


def read_tar(path, expected):
    """Validate all members before consuming any; no extraction here."""
    files = {}
    with tarfile.open(path, "r:") as archive:
        for item in archive.getmembers():
            R.relative_path(item.name)
            A.require(item.isfile() and item.name in expected and item.name not in files
                      and not item.pax_headers and item.mode & 0o7000 == 0,
                      "CLOSED_PAYLOAD_MEMBERSHIP_REQUIRED")
            A.require(0 <= item.size <= 256 * A.LIMIT, "PAYLOAD_MEMBER_SIZE_DENIED")
            stream = archive.extractfile(item)
            if stream is None:
                raise ValueError("PAYLOAD_MEMBER_REQUIRED")
            content = stream.read(item.size + 1)
            A.require(len(content) == item.size, "PAYLOAD_MEMBER_TRUNCATED")
            files[item.name] = content
    A.require(set(files) == set(expected), "CLOSED_PAYLOAD_CLOSURE_REQUIRED")
    return files


def project_native_receipt(raw, metadata, profile):
    """Closed projection: actual identities/outcomes only, never commands/paths."""
    A.require(raw["schema"] == "pansphaira.offline-native-execution/v1" and
              raw["outcome"] == "PASS" and raw["nativeExit"] == 0,
              "OBSERVED_NATIVE_PASS_REQUIRED")
    for field, expected in (("artifactSha256", metadata["sha256"]),
                            ("dependencySha256", profile["dependencies"]["sha256"])):
        A.require(raw[field] == expected, "NATIVE_RECEIPT_IDENTITY_DENIED")
    for field in ("artifactSha256", "metadataSha256", "dependencySha256"):
        A.require(isinstance(raw[field], str) and A.HEX.fullmatch(raw[field]), "RECEIPT_DIGEST_DENIED")
    A.require(raw["sources"] == profile["gitSources"] and raw["runtime"] == profile["runtime"],
              "NATIVE_SOURCE_RUNTIME_BINDING_DENIED")
    A.require(raw["sourceDataPreserved"] is True and raw["postActivationWritesObserved"] is True,
              "NATIVE_PRESERVATION_REQUIRED")
    paired = raw["pairedResults"]
    A.require(len(paired) == 2 and [x["head"] for x in paired] ==
              [profile["gitSources"][name]["commit"] for name in ("source", "target")],
              "ORIGINAL_PAIRED_RESULTS_REQUIRED")
    for value in paired:
        A.require(isinstance(value["digest"], str) and A.HEX.fullmatch(value["digest"]), "PAIR_DIGEST_DENIED")
    rescue = raw["standaloneRescue"]
    A.require(rescue["schema"] == "pansphaira.retained-pair-rescue/v1" and
              rescue["outcome"] == "HELD_REQUIRES_NATIVE_READBACK" and
              rescue["phase"] == "ACTIVE_WITH_NEW_WRITES" and rescue["mutationPerformed"] is False and
              rescue["effectJournalSchema"] == "chimpmaera.demo/effect-store/v4" and
              rescue["reservationStates"] == ["APPLIED"], "OBSERVED_RESCUE_REQUIRED")
    for field in ("effectJournalSha256", "pairStateSha256"):
        A.require(isinstance(rescue[field], str) and A.HEX.fullmatch(rescue[field]), "RESCUE_DIGEST_DENIED")
    return {"outcome": "PASS", "nativeExit": 0,
            **{field: raw[field] for field in ("artifactSha256", "metadataSha256", "dependencySha256")},
            "sourceDataPreserved": True, "postActivationWritesObserved": True,
            "pairedResults": [{"head": x["head"], "digest": x["digest"]} for x in paired],
            "standaloneRescue": {field: rescue[field] for field in
                ("schema", "outcome", "phase", "mutationPerformed", "effectJournalSchema",
                 "effectJournalSha256", "pairStateSha256", "reservationStates")},
            "nonclaims": NONCLAIMS}


def build(args):
    target = B.checkout(HERE.parent)
    native = Path(args.native_bundle)
    baseline = Path(args.baseline_bundle)
    trust = Path(args.trust)
    receipts = {}
    for name, bundle in (("baseline", baseline), ("native", native)):
        # Trust tool/key are separately pinned. The packaged PEM is NOT trust.
        receipts[name] = A.admit(bundle, trust, 0, 0)
        A.require(set(p.name for p in bundle.iterdir() if p.name != "build.json") == set(BUNDLE_FILES),
                  "BUNDLE_EXTRA_FILE_DENIED")
    old = receipts["baseline"]["metadata"]
    new = receipts["native"]["metadata"]
    A.require(old["version"] == 1 and new["version"] == 2 and new["sourceCommit"] == target["commit"],
              "BASELINE_TARGET_IDENTITY_DENIED")
    baseline_source = A.strict_json(A.regular(HERE.parent / "tests/fixtures/pan465/updater-v1/source.json"))
    A.require(old["sourceCommit"] == baseline_source["commit"], "BASELINE_SOURCE_IDENTITY_DENIED")
    old_entries = read_tar(baseline / "artifact.tar", {"scripts/" + n for n in BASELINE_FILES})
    for name in BASELINE_FILES:
        A.require(old_entries["scripts/" + name] == A.regular(HERE.parent / "tests/fixtures/pan465/updater-v1" / name),
                  "AUTHENTIC_BASELINE_BYTES_REQUIRED")
    native_entries = read_tar(native / "artifact.tar", {"scripts/" + n for n in B.FILES} |
                             {"profile/" + n for n in ("profile.json", "source.bundle", "target.bundle",
                                                      "consumer.bundle", "dependencies.tar")})
    profile = A.strict_json(native_entries["profile/profile.json"])
    A.keys(profile, ("schema", "scope", "gitSources", "dependencies", "runtime", "entrypoint", "nonclaims"))
    A.keys(profile["gitSources"], ("source", "target", "consumer"))
    for name, identity in profile["gitSources"].items():
        A.keys(identity, ("commit", "tree", "bundleSha256", "bundleSize"))
        A.require(all(isinstance(identity[k], str) and len(identity[k]) == 40 and
                      set(identity[k]) <= set("0123456789abcdef") for k in ("commit", "tree")),
                  "GIT_OBJECT_FORMAT_DENIED")
        A.integer(identity["bundleSize"], 1)
        A.require(A.HEX.fullmatch(identity["bundleSha256"]), "GIT_BUNDLE_DIGEST_DENIED")
    A.require(profile["gitSources"]["source"]["commit"] == B.SOURCE and
              profile["gitSources"]["consumer"]["commit"] == B.CONSUMER and
              profile["entrypoint"] == "scripts/run-retained-pair-upgrade.mjs", "PROFILE_SOURCE_DENIED")
    runtime = profile["runtime"]
    A.keys(runtime, ("platform", "arch", "node", "abi", "nodeOci", "supersetOci", "preloadedQualificationImage"))
    A.require({k: runtime[k] for k in ("platform", "arch", "node", "abi", "nodeOci", "supersetOci")} ==
              {"platform": "linux", "arch": "x64", "node": "v24.19.0", "abi": "137",
               "nodeOci": B.NODE, "supersetOci": B.SUPERSET} and
              isinstance(runtime["preloadedQualificationImage"], str) and
              runtime["preloadedQualificationImage"].startswith("sha256:") and
              A.HEX.fullmatch(runtime["preloadedQualificationImage"][7:]), "PROFILE_RUNTIME_DENIED")
    A.keys(profile["dependencies"], ("sha256", "size", "packageLockSha256", "files"))
    A.require(A.HEX.fullmatch(profile["dependencies"]["sha256"]) and
              A.HEX.fullmatch(profile["dependencies"]["packageLockSha256"]), "DEPENDENCY_DIGEST_DENIED")
    A.integer(profile["dependencies"]["size"], 1)
    A.integer(profile["dependencies"]["files"], 1)
    A.require(profile["schema"] == "pansphaira.offline-native-profile/v1" and
              profile["scope"] == "LOCAL_SYNTHETIC_RETAINED_PAIR" and
              {k: profile["gitSources"]["target"][k] for k in ("commit", "tree")} == target,
              "PROFILE_TARGET_DENIED")
    for name in B.FILES:
        A.require(native_entries["scripts/" + name] == A.regular(HERE / name), "BOOTSTRAP_BYTE_SUBSTITUTION_DENIED")
    for name, identity in profile["gitSources"].items():
        data = native_entries["profile/" + name + ".bundle"]
        A.require(A.digest(data) == identity["bundleSha256"] and len(data) == identity["bundleSize"],
                  "GIT_BUNDLE_IDENTITY_DENIED")
    dependencies = native_entries["profile/dependencies.tar"]
    A.require(A.digest(dependencies) == profile["dependencies"]["sha256"] and
              len(dependencies) == profile["dependencies"]["size"], "DEPENDENCY_IDENTITY_DENIED")
    raw_receipt_bytes = A.regular(Path(args.native_receipt))
    raw = A.strict_json(raw_receipt_bytes)
    public_receipt = project_native_receipt(raw, new, profile)
    A.require(raw["metadataSha256"] == receipts["native"]["metadataSha256"], "SIGNED_METADATA_RECEIPT_DENIED")
    key = A.strict_json(A.regular(trust))
    public_key = A.regular(Path(key["releaseKey"]))
    A.require(public_key.startswith(b"-----BEGIN PUBLIC KEY-----\n") and
              public_key.rstrip().endswith(b"-----END PUBLIC KEY-----"), "PUBLIC_KEY_ONLY_REQUIRED")
    entries = {"scripts/" + n: native_entries["scripts/" + n] for n in B.FILES}
    entries["docs/offline-profile.txt"] = A.regular(HERE.parent / "docs/architecture/pan465-offline-profile.txt")
    entries["release-public.pem"] = public_key
    for name, bundle in (("baseline", baseline), ("native", native)):
        for filename in BUNDLE_FILES:
            entries[f"bundles/{name}/{filename}"] = A.regular(bundle / filename, 256 * A.LIMIT)
    entries["receipts/native-execution.json"] = R.encoded(public_receipt)
    declaration = {"schema": "pansphaira.offline-distribution/v1", "profile": "PAN465_OFFLINE_RETAINED_NATIVE",
                   "sourceCommit": target["commit"], "sourceTree": target["tree"],
                   "baselineArtifactSha256": old["sha256"], "nativeArtifactSha256": new["sha256"],
                   "metadataSha256": receipts["native"]["metadataSha256"],
                   "releasePublicKeySha256": A.digest(public_key),
                   "consumedNativeReceiptSha256": A.digest(raw_receipt_bytes),
                   "runtime": profile["runtime"], "gitSources": profile["gitSources"],
                   "signedMetadata": True, "productionAuthority": False,
                   "nonclaims": NONCLAIMS,
                   "files": {n: {"sha256": A.digest(data), "size": len(data)} for n, data in sorted(entries.items())}}
    entries["distribution.json"] = R.encoded(declaration)
    entries["SHA256SUMS"] = "".join(f"{A.digest(data)}  {n}\n" for n, data in sorted(entries.items())).encode()
    output = Path(args.output)
    A.require(output.is_absolute() and not output.exists() and output.parent.resolve() == output.parent,
              "NEW_ABSOLUTE_OUTPUT_REQUIRED")
    A.require(HERE.parent not in output.parents, "OUTPUT_OUTSIDE_SOURCE_REQUIRED")
    output.mkdir(mode=0o700)
    archive_path = output / "pansphaira-pan465-offline.tar.gz"
    with archive_path.open("xb") as stream, gzip.GzipFile(filename="", fileobj=stream, mode="wb", mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode="w|", format=tarfile.USTAR_FORMAT) as archive:
            for name, data in sorted(entries.items()):
                info = tarfile.TarInfo(name)
                info.mode, info.size = 0o644, len(data)
                archive.addfile(info, io.BytesIO(data))
    digest = R.sha(archive_path.read_bytes())
    (output / (archive_path.name + ".sha256")).write_text(f"{digest}  {archive_path.name}\n")
    (output / "distribution.json").write_bytes(entries["distribution.json"])
    (output / "native-execution.json").write_bytes(entries["receipts/native-execution.json"])
    A.require(B.checkout(HERE.parent) == target, "PACKAGE_INPUT_CHANGED_DENIED")
    return {"outcome": "DISTRIBUTION_COMPOSED_NOT_RELEASE_ACCEPTED", "sourceCommit": target["commit"],
            "archive": archive_path.name, "archiveSha256": digest, "files": len(entries),
            "privateMaterialIncluded": False, "publicationAuthorized": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("native-bundle", "baseline-bundle", "trust", "native-receipt", "output"):
        parser.add_argument("--" + name, required=True)
    try:
        result = build(parser.parse_args())
    except (ValueError, OSError, TypeError, KeyError, subprocess.SubprocessError, tarfile.TarError):
        print(json.dumps({"outcome": "DISTRIBUTION_DENIED", "publicationAuthorized": False}))
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
