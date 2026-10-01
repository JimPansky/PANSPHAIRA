"""Reader contract fixtures only; actual native qualification is a separate gate."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class RetainedReaderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="pan465-rescue-", dir=os.environ.get("TMPDIR"))
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.control = self.root/"pan464-owned-v1/pan453-owned-v2"
        self.control.mkdir(parents=True)
        self.rescue = self.root/"rescue.py"
        shutil.copyfile(ROOT/"scripts/offline-rescue.py", self.rescue)
        self.operation = "native:pan464-pair-v1"
        self.record = {"schemaVersion":"chimpmaera.demo/effect-store/v4", "effects":{},
            "reservations":{self.operation:{"actionDigest":"a"*64, "authorityBinding":"b"*64,
                "authorityKind":"INSTALLER_APPROVAL_V1", "leaseId":None, "recovery":"NONE",
                "reservedAtMs":1, "status":"EXECUTING"}}, "consumedAuthorityLeases":{}}
        self.pair = {"phase":"CHECKPOINTED", "edgeDigest":"c"*64}
        self.put()

    def put(self):
        (self.control/"effects.json").write_text(json.dumps(self.record))
        (self.control/"pair-state.json").write_text(json.dumps(self.pair))

    def inventory(self):
        return {p.relative_to(self.root).as_posix():hashlib.sha256(p.read_bytes()).hexdigest()
                for p in self.root.rglob("*") if p.is_file()}

    def read(self, success=True):
        before = self.inventory()
        result = subprocess.run([sys.executable,"-I","-B",str(self.rescue),"--retained-pair-root",str(self.root)],
            cwd=self.root, env={"PATH":"/usr/bin:/bin"}, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, timeout=10)
        self.assertEqual(result.stderr, "")
        self.assertEqual(result.returncode, 0 if success else 1, result.stdout)
        self.assertEqual(self.inventory(), before)
        value = json.loads(result.stdout)
        self.assertFalse(value["mutationPerformed"])
        return value

    def applied(self):
        receipt = {"schemaVersion":"pansphaira.pan464/retained-pair-receipt/v1", "replayKey":self.operation,
            "actionDigest":"a"*64, "outcome":"LOCAL_RETAINED_PAIR_VERIFIED", "readbackDigest":"d"*64,
            "checkpointDigest":"e"*64}
        receipt["receiptDigest"] = hashlib.sha256(json.dumps(receipt,sort_keys=True,separators=(",",":")).encode()).hexdigest()
        self.record["reservations"][self.operation]["status"] = "APPLIED"
        self.record["effects"][self.operation] = {"actionDigest":"a"*64,"providerResult":{},"readback":{},"receipt":receipt}
        self.pair["phase"] = "ACTIVE_WITH_NEW_WRITES"
        self.put()

    def test_executing_and_ambiguous_are_observed_not_replayed(self):
        value = self.read()
        self.assertEqual(value["reservationStates"], ["EXECUTING"])
        self.assertEqual(value["outcome"], "HELD_REQUIRES_NATIVE_READBACK")
        self.record["reservations"][self.operation].update(status="AMBIGUOUS",recovery="RECONCILE")
        self.put()
        self.assertEqual(self.read()["reservationStates"], ["AMBIGUOUS"])

    def test_applied_does_not_authorize_restore_or_fresh_business_claim(self):
        self.applied()
        value = self.read()
        self.assertEqual(value["phase"], "ACTIVE_WITH_NEW_WRITES")
        self.assertEqual(value["reservationStates"], ["APPLIED"])
        self.assertEqual(value["outcome"], "HELD_REQUIRES_NATIVE_READBACK")
        self.assertIn("NO_FRESH_BUSINESS_READBACK",value["nonclaims"])

    def test_active_without_applied_receipt_is_unknown(self):
        self.pair["phase"] = "ACTIVE"
        self.put()
        self.assertEqual(self.read(False)["outcome"], "UNKNOWN_HELD")

    def test_unsupported_schema_and_corrupt_receipt_fail_closed(self):
        self.applied()
        self.record["schemaVersion"] = "chimpmaera.demo/effect-store/v99"
        self.put()
        self.read(False)
        self.record["schemaVersion"] = "chimpmaera.demo/effect-store/v4"
        self.record["effects"][self.operation]["receipt"]["checkpointDigest"] = "f"*64
        self.put()
        self.read(False)

    def test_missing_receipt_and_historical_nonconforming_shape_fail_closed(self):
        self.applied()
        self.record["effects"][self.operation]["receipt"] = {"outcome":"LOCAL_RETAINED_PAIR_VERIFIED"}
        self.put()
        self.read(False)
        (self.control/"effects.json").unlink()
        self.read(False)

    def test_existing_owner_lock_is_never_adopted_or_removed(self):
        (self.control/"operation.lock").write_text("retained-process-owner")
        value = self.read()
        self.assertTrue(value["ownerLockPresent"])
        self.assertIn("NO_LOCK_ADOPTION", value["nonclaims"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
