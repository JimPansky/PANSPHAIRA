"""Real OpenSSL and subprocess CLI tests; artifact admission only, not slot execution."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import unittest

ENTRY = Path(__file__).resolve().parents[2] / "scripts/offline-artifact.py"


class OfflineArtifactTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="pan465-artifact-", dir=os.environ.get("TMPDIR"))
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.bundle = self.root / "bundle"
        self.bundle.mkdir()
        executable = shutil.which("openssl")
        if executable is None:
            raise RuntimeError("OpenSSL required: no skipped signature qualification")
        self.openssl = Path(executable).resolve()
        self.key = self.root / "signing.pem"
        self.public = self.root / "release.pem"
        self.crypto("genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048", "-out", str(self.key))
        os.chmod(self.key, 0o600)
        self.crypto("pkey", "-in", str(self.key), "-pubout", "-out", str(self.public))
        self.trust = self.root / "trust.json"
        self.trust.write_text(json.dumps({"schema":"pansphaira.offline-trust/v1", "profile":"local-retained-pair",
            "openssl":str(self.openssl), "opensslSha256":self.sha(self.openssl),
            "releaseKey":str(self.public), "releaseKeySha256":self.sha(self.public), "minimumVersion":1}))
        # The archive contains real verifier source, but this test does NOT claim
        # a runnable updater or qualified retained-pair artifact from these bytes.
        with tarfile.open(self.bundle / "artifact.tar", "w") as archive:
            archive.add(ENTRY, arcname="scripts/offline-artifact.py")
        now = int(time.time())
        self.metadata = {"schema":"pansphaira.offline-artifact/v1", "profile":"local-retained-pair", "role":"release",
            "version":2, "issuedAt":now-60, "expiresAt":now+600, "artifact":"artifact.tar",
            "sha256":self.sha(self.bundle / "artifact.tar"), "size":(self.bundle / "artifact.tar").stat().st_size,
            "sourceCommit":subprocess.check_output(["git","rev-parse","HEAD"],cwd=ENTRY.parent,text=True).strip(),
            "entrypoint":"scripts/offline-updater.py"}
        self.sign()

    @staticmethod
    def sha(path):
        return hashlib.sha256(path.read_bytes()).hexdigest()

    def crypto(self, *args):
        subprocess.run([str(self.openssl), *args], check=True, stdin=subprocess.DEVNULL,
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30,
                       env={"PATH":"/usr/bin:/bin", "OPENSSL_CONF":os.devnull})

    def sign(self, key=None, raw=None):
        path = self.bundle / "artifact.json"
        path.write_text(raw if raw is not None else json.dumps(self.metadata))
        self.crypto("dgst", "-sha256", "-sign", str(key or self.key), "-out",
                    str(self.bundle / "artifact.sig"), str(path))

    def run_cli(self, minimum=1, clock=0, trust=None):
        result = subprocess.run([sys.executable, str(ENTRY), "--bundle", str(self.bundle),
            "--trust", str(trust or self.trust), "--minimum-version", str(minimum),
            "--last-verified-time", str(clock)], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, timeout=30, env={"PATH":"/usr/bin:/bin"})
        self.assertEqual(result.stderr, "")
        return result.returncode, json.loads(result.stdout)

    def denied(self, **args):
        status, receipt = self.run_cli(**args)
        self.assertEqual(status, 1)
        self.assertEqual(receipt, {"outcome":"DENIED", "executionAuthorized":False})

    def test_real_offline_signature_and_exact_artifact_bytes(self):
        status, receipt = self.run_cli()
        self.assertEqual(status, 0)
        self.assertEqual(receipt["outcome"], "OFFLINE_BYTES_VERIFIED_NOT_EXECUTED")
        self.assertEqual(receipt["metadata"]["sha256"], self.sha(self.bundle / "artifact.tar"))
        self.assertEqual(receipt["verifierSha256"], self.sha(self.openssl))

    def test_artifact_tampering_denied(self):
        with (self.bundle / "artifact.tar").open("ab") as stream:
            stream.write(b"tampered")
        self.denied()

    def test_signed_metadata_tampering_denied(self):
        self.metadata["version"] = 99
        (self.bundle / "artifact.json").write_text(json.dumps(self.metadata))
        self.denied()

    def test_wrong_signer_key_denied(self):
        wrong = self.root / "other.pem"
        self.crypto("genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048", "-out", str(wrong))
        self.sign(wrong)
        self.denied()

    def test_wrong_signer_role_even_with_valid_signature_denied(self):
        self.metadata["role"] = "observer"
        self.sign()
        self.denied()

    def test_expired_signed_metadata_denied(self):
        self.metadata["expiresAt"] = int(time.time())-1
        self.sign()
        self.denied()

    def test_future_metadata_denied(self):
        self.metadata["issuedAt"] = int(time.time())+60
        self.sign()
        self.denied()

    def test_rollback_and_replay_denied(self):
        self.denied(minimum=2)
        self.denied(minimum=3)

    def test_clock_rollback_denied(self):
        self.denied(clock=int(time.time())+60)

    def test_bundle_cannot_supply_own_trust(self):
        embedded = self.bundle / "trust.json"
        shutil.copyfile(self.trust, embedded)
        self.denied(trust=embedded)

    def test_pinned_verifier_and_key_substitution_denied(self):
        trust = json.loads(self.trust.read_text())
        trust["opensslSha256"] = "0"*64
        self.trust.write_text(json.dumps(trust))
        self.denied()
        trust["opensslSha256"] = self.sha(self.openssl)
        trust["releaseKeySha256"] = "0"*64
        self.trust.write_text(json.dumps(trust))
        self.denied()

    def test_duplicate_keys_and_nonfinite_metadata_denied(self):
        raw = json.dumps(self.metadata)
        self.sign(raw=raw[:-1]+', "version":3}')
        self.denied()
        self.metadata["expiresAt"] = float("inf")
        self.sign()
        self.denied()

    def test_symlink_artifact_denied(self):
        artifact = self.bundle / "artifact.tar"
        retained = self.root / "retained.tar"
        artifact.rename(retained)
        artifact.symlink_to(retained)
        self.denied()


if __name__ == "__main__":
    unittest.main()
