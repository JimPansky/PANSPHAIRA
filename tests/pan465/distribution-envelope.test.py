"""Envelope COMPONENT tests with real OpenSSL/CLI; NOT native execution evidence.

The small signed fixtures deliberately do not contain Git/native dependencies.
Their positive check asserts only envelope/signature/inventory verification.
"""
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
import tarfile
import unittest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
Base = runpy.run_path(str(HERE / "offline-artifact.test.py"))["OfflineArtifactTests"]
VERIFY = ROOT / "scripts/verify-offline-release.py"
V = runpy.run_path(str(VERIFY))


class EnvelopeTests(unittest.TestCase):
    root: Path
    bundle: Path
    public: Path
    trust: Path
    metadata: dict
    sha = staticmethod(Base.sha)
    crypto = Base.crypto
    sign = Base.sign

    def setUp(self):
        Base.setUp(self)
        self.entries = {}
        for name in V["PAYLOAD"]:
            self.entries[name] = b"component-only fixture\n"
        self.entries["release-public.pem"] = self.public.read_bytes()
        for name in V["PAYLOAD"]:
            if name.startswith("scripts/"):
                self.entries[name] = (ROOT / name).read_bytes()
        native = io.BytesIO()
        with tarfile.open(fileobj=native, mode="w", format=tarfile.USTAR_FORMAT) as archive:
            for name in sorted(n for n in self.entries if n.startswith("scripts/")):
                data = self.entries[name]
                info = tarfile.TarInfo(name)
                info.mode, info.size = 0o644, len(data)
                archive.addfile(info, io.BytesIO(data))
        (self.bundle / "artifact.tar").write_bytes(native.getvalue())
        self.metadata.update(sha256=self.sha(self.bundle / "artifact.tar"), size=len(native.getvalue()))
        self.sign()
        new = copy.deepcopy(self.metadata)
        for filename in ("artifact.tar", "artifact.json", "artifact.sig"):
            self.entries["bundles/native/" + filename] = (self.bundle / filename).read_bytes()
        new_metadata_digest = self.sha(self.bundle / "artifact.json")
        self.metadata["version"] = 1
        self.sign()
        for filename in ("artifact.tar", "artifact.json", "artifact.sig"):
            self.entries["bundles/baseline/" + filename] = (self.bundle / filename).read_bytes()
        self.declaration = {"schema": "pansphaira.offline-distribution/v1",
                            "profile": "PAN465_OFFLINE_RETAINED_NATIVE", "productionAuthority": False,
                            "sourceCommit": new["sourceCommit"], "metadataSha256": new_metadata_digest,
                            "baselineArtifactSha256": new["sha256"], "nativeArtifactSha256": new["sha256"],
                            "releasePublicKeySha256": self.sha(self.public)}
        self.entries["receipts/native-execution.json"] = json.dumps({
            "outcome": "PASS", "nativeExit": 0, "artifactSha256": new["sha256"],
            "metadataSha256": new_metadata_digest,
            "fixtureBoundary": "COMPONENT_ONLY_NOT_OBSERVED_NATIVE_EXECUTION"}).encode()
        self.output = self.root / "verified"
        self.archive = self.root / "distribution.tar.gz"

    def compose(self, extra=None, duplicate=None, symlink=False, inventory_as_list=False):
        entries = dict(self.entries)
        declaration = dict(self.declaration)
        declaration["files"] = {name: {"sha256": hashlib.sha256(data).hexdigest(), "size": len(data)}
                                for name, data in self.entries.items()}
        if inventory_as_list:
            declaration["files"] = sorted(self.entries)
        entries["distribution.json"] = json.dumps(declaration).encode()
        entries["SHA256SUMS"] = "".join(f"{hashlib.sha256(data).hexdigest()}  {name}\n"
                                       for name, data in sorted(entries.items())).encode()
        if extra:
            entries[extra] = b"must be rejected\n"
        with tarfile.open(self.archive, "w:gz", format=tarfile.USTAR_FORMAT) as archive:
            for name, data in entries.items():
                info = tarfile.TarInfo(name)
                info.mode, info.size = 0o644, len(data)
                if symlink and name == "scripts/offline-updater.py":
                    info.type, info.linkname, info.size = tarfile.SYMTYPE, "outside", 0
                    archive.addfile(info)
                else:
                    archive.addfile(info, io.BytesIO(data))
                if duplicate == name:
                    archive.addfile(info, io.BytesIO(data))
        return self.sha(self.archive)

    def cli(self, expected=None, **compose):
        digest = self.compose(**compose)
        result = subprocess.run([sys.executable, "-B", str(VERIFY), "--archive", str(self.archive),
            "--sha256", expected or digest, "--trust", str(self.trust), "--output", str(self.output)],
            text=True, capture_output=True, timeout=30,
            env={"PATH": "/usr/bin:/bin", "TMPDIR": os.environ["TMPDIR"], "PYTHONDONTWRITEBYTECODE": "1"})
        self.assertEqual(result.stderr, "", result.stdout)
        return result.returncode, json.loads(result.stdout)

    def denied(self, **args):
        code, receipt = self.cli(**args)
        self.assertEqual(code, 1, receipt)
        self.assertEqual(receipt, {"outcome": "DISTRIBUTION_DENIED", "executionAuthorized": False})
        self.assertFalse(self.output.exists(), "denial must precede output creation")

    def test_small_signed_envelope_integrity_only_not_native_qualification(self):
        code, receipt = self.cli()
        self.assertEqual(code, 0, receipt)
        self.assertEqual(receipt["outcome"], "OFFLINE_DISTRIBUTION_VERIFIED_NOT_INSTALLED")
        self.assertFalse(receipt["executionAuthorized"])
        self.assertEqual({str(p.relative_to(self.output)) for p in self.output.rglob("*") if p.is_file()}, V["MEMBERS"])

    def test_external_digest_mismatch_before_output(self):
        self.denied(expected="0" * 64)

    def test_private_material_extra_member_before_output(self):
        self.denied(extra="qualification-signing.pem")

    def test_inventory_list_is_structured_denial_not_path_traceback(self):
        self.denied(inventory_as_list=True)

    def test_duplicate_member_before_output(self):
        self.denied(duplicate="distribution.json")

    def test_symlink_member_before_output(self):
        self.denied(symlink=True)

    def test_missing_member_before_output(self):
        del self.entries["docs/offline-profile.txt"]
        self.denied()

    def test_arbitrary_local_path_member_before_output(self):
        self.denied(extra="../escape")

    def test_wrong_external_key_pin_before_output(self):
        trust = json.loads(self.trust.read_text())
        trust["releaseKeySha256"] = "0" * 64
        self.trust.write_text(json.dumps(trust))
        self.denied()

    def test_invalid_signature_with_consistent_outer_checksums(self):
        self.entries["bundles/native/artifact.sig"] = b"not a signature"
        self.denied()

    def test_substituted_unsigned_bootstrap_with_consistent_checksums(self):
        self.entries["scripts/offline-updater.py"] += b"\n# substituted\n"
        self.denied()

    def test_native_receipt_for_other_artifact_denied(self):
        raw = json.loads(self.entries["receipts/native-execution.json"])
        raw["artifactSha256"] = "0" * 64
        self.entries["receipts/native-execution.json"] = json.dumps(raw).encode()
        self.denied()

    def test_consistent_inventory_cannot_change_designated_metadata_digest(self):
        self.declaration["metadataSha256"] = "0" * 64
        self.denied()


if __name__ == "__main__":
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(EnvelopeTests))
    raise SystemExit(0 if result.wasSuccessful() else 1)
