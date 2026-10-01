"""Real updater processes and immutable executable slots; no main-app claim."""
import json
import os
from pathlib import Path
import runpy
import shutil
import subprocess
import sys
import tarfile
import unittest

HERE = Path(__file__).resolve().parent
Base = runpy.run_path(str(HERE/"offline-artifact.test.py"))["OfflineArtifactTests"]
ROOT = HERE.parents[1]
UPDATER = ROOT/"scripts/offline-updater.py"
RESCUE = ROOT/"scripts/offline-rescue.py"


class UpdaterBaselineTests(Base):
    def setUp(self):
        super().setUp()
        self.install = self.root/"installation"
        self.install.mkdir(mode=0o700)
        self.runnable_bundle()

    def runnable_bundle(self):
        with tarfile.open(self.bundle/"artifact.tar", "w", format=tarfile.USTAR_FORMAT) as archive:
            for name in ("offline-artifact.py", "offline-rescue.py", "offline-updater.py"):
                archive.add(ROOT/"scripts"/name, arcname="scripts/"+name)
        self.metadata["size"] = (self.bundle/"artifact.tar").stat().st_size
        self.metadata["sha256"] = self.sha(self.bundle/"artifact.tar")
        self.sign()

    def updater(self, command, *args, entry=UPDATER):
        result = subprocess.run([sys.executable,"-B",str(entry),command,"--root",str(self.install),*args],
            text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30,
            env={"PATH":"/usr/bin:/bin", "PYTHONDONTWRITEBYTECODE":"1"})
        self.assertEqual(result.stderr, "", result.stdout)
        return result.returncode, json.loads(result.stdout)

    def initialize(self):
        status, receipt = self.updater("init", "--bundle",str(self.bundle),"--trust",str(self.trust))
        self.assertEqual(status, 0, receipt)
        self.assertEqual(receipt["outcome"], "STABLE")
        self.assertEqual(receipt["targetArtifact"], self.metadata["sha256"])
        return receipt

    def inventory(self):
        return {p.relative_to(self.install).as_posix():
            ("symlink",os.readlink(p)) if p.is_symlink() else ("file",self.sha(p))
            for p in self.install.rglob("*") if p.is_file() or p.is_symlink()}

    def test_real_initial_executable_slot_and_launch(self):
        receipt = self.initialize()
        self.assertEqual(receipt["journalProtocol"], 1)
        self.assertTrue((self.install/"current").is_symlink())
        before = self.inventory()
        status, selected = self.updater("launch")
        self.assertEqual(status, 0, selected)
        self.assertEqual(selected, receipt)
        self.assertEqual(before, self.inventory())

    def test_installed_floor_cannot_be_lowered_by_caller(self):
        self.initialize()
        before = self.inventory()
        status, receipt = self.updater("apply", "--bundle", str(self.bundle))
        self.assertEqual(status, 1)
        self.assertEqual(receipt["outcome"], "DENIED_OR_HELD")
        self.assertEqual(before, self.inventory())

    def test_standalone_rescue_needs_no_main_application_or_repository(self):
        receipt = self.initialize()
        rescue = self.root/"rescue.py"
        shutil.copyfile(RESCUE, rescue)
        before = self.inventory()
        result = subprocess.run([sys.executable,"-I","-B",str(rescue),"--root",str(self.install)],
            cwd=self.root, env={"PATH":"/usr/bin:/bin"}, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), receipt)
        self.assertEqual(before, self.inventory())

    def test_historical_bundle_and_journal_tampering_blocks_execution(self):
        self.initialize()
        record = self.install/"journal"/"00000000000000000001.json"
        os.chmod(record, 0o600)
        value = json.loads(record.read_text())
        value["record"]["version"] = 99
        record.write_text(json.dumps(value))
        before = self.inventory()
        status, receipt = self.updater("launch")
        self.assertEqual(status, 1, receipt)
        self.assertEqual(before, self.inventory())

    def test_selected_executable_tampering_blocks_launch(self):
        self.initialize()
        entry = self.install/"slots"/self.metadata["sha256"]/"scripts/offline-updater.py"
        os.chmod(entry, 0o600)
        entry.write_text("raise SystemExit(99)\n")
        status, receipt = self.updater("launch")
        self.assertEqual(status, 1, receipt)

    def test_signed_archive_path_escape_denied_before_install(self):
        with tarfile.open(self.bundle/"artifact.tar", "w", format=tarfile.USTAR_FORMAT) as archive:
            archive.add(UPDATER, arcname="../outside.py")
        self.metadata["size"] = (self.bundle/"artifact.tar").stat().st_size
        self.metadata["sha256"] = self.sha(self.bundle/"artifact.tar")
        self.sign()
        status, receipt = self.updater("init", "--bundle",str(self.bundle),"--trust",str(self.trust))
        self.assertEqual(status, 1, receipt)
        self.assertFalse((self.root/"outside.py").exists())
        self.assertFalse((self.install/"current").exists())

    def test_signed_archive_symlink_denied(self):
        with tarfile.open(self.bundle/"artifact.tar", "w", format=tarfile.USTAR_FORMAT) as archive:
            item = tarfile.TarInfo("scripts/offline-updater.py")
            item.type = tarfile.SYMTYPE
            item.linkname = "../../outside.py"
            archive.addfile(item)
        self.metadata["size"] = (self.bundle/"artifact.tar").stat().st_size
        self.metadata["sha256"] = self.sha(self.bundle/"artifact.tar")
        self.sign()
        status, receipt = self.updater("init", "--bundle",str(self.bundle),"--trust",str(self.trust))
        self.assertEqual(status, 1, receipt)
        self.assertFalse((self.install/"current").exists())


if __name__ == "__main__":
    # Base-class admission cases are exercised in their own test command; run
    # only the actual updater cases here, not an inflated duplicate test count.
    names = [name for name in UpdaterBaselineTests.__dict__ if name.startswith("test_")]
    suite = unittest.TestSuite(UpdaterBaselineTests(name) for name in names)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(not result.wasSuccessful())
