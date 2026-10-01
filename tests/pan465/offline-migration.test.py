"""Execute a real committed updater v1 -> current v2 transition and SIGKILLs.

Baseline source is byte-for-byte from an actual usable implementation commit,
not a mock executable. These are local process crashes, never power-loss tests.
"""
import hashlib
import json
import os
from pathlib import Path
import runpy
import selectors
import shutil
import signal
import subprocess
import sys
import tarfile
import unittest

HERE = Path(__file__).resolve().parent
BASE = runpy.run_path(str(HERE/"offline-updater.test.py"))
BaselineTests = BASE["UpdaterBaselineTests"]
ROOT = HERE.parents[1]
FROZEN = ROOT/"tests/fixtures/pan465/updater-v1"
RESCUE = ROOT/"scripts/offline-rescue.py"


class MigrationTests(BaselineTests):
    def setUp(self):
        super().setUp()
        self.target_metadata = dict(self.metadata)
        self.target_bundle = self.root/"target-bundle"
        shutil.copytree(self.bundle, self.target_bundle)
        provenance = json.loads((FROZEN/"source.json").read_text())
        self.assertEqual(provenance["classification"], "ACTUAL_IMPLEMENTED_LOCAL_BASELINE_NOT_PREVIOUS_PUBLIC_RELEASE")
        with tarfile.open(self.bundle/"artifact.tar", "w", format=tarfile.USTAR_FORMAT) as archive:
            for name, expected in provenance["files"].items():
                self.assertEqual(hashlib.sha256((FROZEN/name).read_bytes()).hexdigest(), expected)
                archive.add(FROZEN/name, arcname="scripts/"+name)
        self.metadata.update(version=1, sourceCommit=provenance["commit"],
            size=(self.bundle/"artifact.tar").stat().st_size, sha256=self.sha(self.bundle/"artifact.tar"))
        self.sign()
        receipt = self.initialize()
        self.assertEqual(receipt["journalProtocol"], 1)
        self.original = self.inventory()
        self.old_updater = self.install/"slots"/self.metadata["sha256"]/"scripts/offline-updater.py"
        self.assertNotEqual(self.metadata["sha256"], self.target_metadata["sha256"])
        self.operation = self.sha(self.target_bundle/"artifact.json")

    def rescue(self):
        # Copy one stdlib-only executable outside both application and updater
        # slots; isolated Python has no repository import/search path.
        rescue = self.root/"independent-rescue.py"
        if not rescue.exists():
            shutil.copyfile(RESCUE, rescue)
        result = subprocess.run([sys.executable,"-I","-B",str(rescue),"--root",str(self.install)],
            cwd=self.root, env={"PATH":"/usr/bin:/bin"}, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, timeout=10)
        self.assertEqual(result.stderr, "")
        self.assertEqual(result.returncode, 0, result.stdout)
        return json.loads(result.stdout)

    def assert_history_unchanged(self):
        actual = self.inventory()
        for name, value in self.original.items():
            if name != "current":
                self.assertEqual(actual.get(name), value, name)

    def test_actual_executable_transition_and_retained_journal_migration(self):
        code, result = self.updater("apply", "--bundle", str(self.target_bundle), entry=self.old_updater)
        self.assertEqual(code, 0, result)
        self.assertEqual(result["outcome"], "STABLE")
        self.assertEqual(result["journalProtocol"], 2)
        self.assertEqual(result["activeArtifact"], self.target_metadata["sha256"])
        self.assertEqual(result["highestReservedVersion"], 2)
        self.assertTrue((self.install/"journal-v2.json").is_file())
        self.assert_history_unchanged()
        before = self.inventory()
        self.assertEqual(self.rescue(), result)
        self.assertEqual(before, self.inventory())

    def kill_at(self, boundary):
        process = subprocess.Popen([sys.executable,"-B",str(self.old_updater),"apply","--root",str(self.install),
            "--bundle",str(self.target_bundle),"--pause-at",boundary,"--local-synthetic-qualification"],
            text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            env={"PATH":"/usr/bin:/bin", "PYTHONDONTWRITEBYTECODE":"1"})
        try:
            if process.stdout is None:
                raise RuntimeError("qualification stdout required")
            selector = selectors.DefaultSelector()
            with selector:
                selector.register(process.stdout, selectors.EVENT_READ)
                self.assertTrue(selector.select(timeout=15), "actual updater did not reach boundary")
                line = process.stdout.readline()
            self.assertEqual(json.loads(line), {"qualificationBoundary":boundary})
            process.kill()
            output, error = process.communicate(timeout=10)
            self.assertEqual(process.returncode, -signal.SIGKILL)
            self.assertEqual(error, "", output)
        finally:
            if process.poll() is None:
                process.kill()
                process.communicate(timeout=10)
        before = self.inventory()
        observed = self.rescue()
        self.assertEqual(observed["outcome"], "HELD_NO_AUTOMATIC_RESTORE")
        self.assertEqual(before, self.inventory(), "rescue mutated retained state")
        self.assert_history_unchanged()
        # Wrong operation and an ordinary apply never guess past interruption.
        code, _ = self.updater("resume", "--operation", "0"*64)
        self.assertEqual(code, 1)
        code, _ = self.updater("apply", "--bundle", str(self.target_bundle))
        self.assertEqual(code, 1)
        self.assertEqual(before, self.inventory())
        return observed, before

    def resume_exact(self, before):
        code, result = self.updater("resume", "--operation", self.operation)
        self.assertEqual(code, 0, result)
        self.assertEqual(result["outcome"], "STABLE")
        self.assertEqual(result["journalProtocol"], 2)
        self.assertEqual(result["activeArtifact"], self.target_metadata["sha256"])
        current = self.inventory()
        for name, value in before.items():
            if name != "current":
                self.assertEqual(current.get(name), value, name)
        self.assert_history_unchanged()
        return result

    def test_sigkill_before_actual_executable_switch(self):
        observed, before = self.kill_at("BEFORE_SWITCH")
        self.assertEqual(observed["phase"], "SWITCH_INTENT")
        self.assertFalse(observed["targetSelected"])
        self.assertEqual(observed["activeArtifact"], self.metadata["sha256"])
        self.resume_exact(before)

    def test_sigkill_after_actual_switch_before_acknowledgement(self):
        observed, before = self.kill_at("AFTER_SWITCH")
        self.assertEqual(observed["phase"], "SWITCH_INTENT")
        self.assertTrue(observed["targetSelected"])
        self.resume_exact(before)

    def test_sigkill_during_real_partial_journal_migration(self):
        observed, before = self.kill_at("DURING_JOURNAL_MIGRATION")
        self.assertEqual(observed["phase"], "MIGRATION_INTENT")
        self.assertEqual(observed["journalProtocol"], 1)
        self.assertTrue(observed["targetSelected"])
        partials = list((self.install/"journal-migrations").glob("*.partial"))
        self.assertEqual(len(partials), 1)
        retained = partials[0].read_bytes()
        with self.assertRaises(json.JSONDecodeError):
            json.loads(retained)
        self.assertFalse((self.install/"journal-v2.json").exists())
        self.resume_exact(before)
        self.assertEqual(partials[0].read_bytes(), retained)
        self.assertEqual(len(list((self.install/"journal-migrations").glob("*.partial"))), 2)

    def test_old_signed_artifact_rollback_denied_after_migration(self):
        code, _ = self.updater("apply", "--bundle",str(self.target_bundle),entry=self.old_updater)
        self.assertEqual(code, 0)
        before = self.inventory()
        code, result = self.updater("apply", "--bundle",str(self.bundle))
        self.assertEqual(code, 1, result)
        self.assertEqual(before, self.inventory())

    def test_competing_updater_denied_while_process_stopped(self):
        process = subprocess.Popen([sys.executable,"-B",str(self.old_updater),"apply","--root",str(self.install),
            "--bundle",str(self.target_bundle),"--pause-at","BEFORE_SWITCH","--local-synthetic-qualification"],
            text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            env={"PATH":"/usr/bin:/bin", "PYTHONDONTWRITEBYTECODE":"1"})
        try:
            if process.stdout is None:
                raise RuntimeError("qualification stdout required")
            with selectors.DefaultSelector() as selector:
                selector.register(process.stdout, selectors.EVENT_READ)
                self.assertTrue(selector.select(timeout=15))
                self.assertEqual(json.loads(process.stdout.readline()), {"qualificationBoundary":"BEFORE_SWITCH"})
            before = self.inventory()
            code, _ = self.updater("resume", "--operation",self.operation)
            self.assertEqual(code, 1)
            self.assertEqual(before, self.inventory())
        finally:
            process.kill()
            process.communicate(timeout=10)
        self.resume_exact(before)


if __name__ == "__main__":
    names = [name for name in MigrationTests.__dict__ if name.startswith("test_")]
    suite = unittest.TestSuite(MigrationTests(name) for name in names)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(not result.wasSuccessful())
