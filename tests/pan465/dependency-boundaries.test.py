"""Real dependency tar/filesystem boundary tests, not native qualification.

Full signed-profile CLI regressions are a separate exact-artifact gate. These
small cases explicitly exercise the builder/extractor components without
pretending that a fixture is a complete native distribution.
"""
import io
import os
from pathlib import Path
import runpy
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
EXTRACT = runpy.run_path(str(ROOT/"scripts/offline-native-profile.py"))["extract_dependencies"]
PACK = runpy.run_path(str(ROOT/"scripts/build-offline-native-profile.py"))["dependencies"]


class DependencyBoundaries(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="pan465-dependencies-", dir=os.environ.get("TMPDIR"))
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.target = self.root/"target"
        self.target.mkdir()
        self.archive = self.root/"dependencies.tar"

    def tar(self, entries):
        with tarfile.open(self.archive, "w", format=tarfile.USTAR_FORMAT) as archive:
            for name, kind, value in entries:
                item = tarfile.TarInfo(name)
                item.mode = 0o755
                if kind == "file":
                    item.size = len(value)
                    archive.addfile(item, io.BytesIO(value))
                else:
                    item.type = tarfile.SYMTYPE
                    item.linkname = value
                    archive.addfile(item)

    def builder_root(self):
        source = self.root/"source"
        (source/"node_modules").mkdir(parents=True)
        (source/"package-lock.json").write_text('{"fixture":"not registry provenance"}\n')
        return source

    def test_real_dependency_roundtrip_keeps_valid_contained_symlink(self):
        source = self.builder_root()
        (source/"node_modules/pkg").mkdir()
        (source/"node_modules/.bin").mkdir()
        (source/"node_modules/pkg/program.js").write_bytes(b"console.log('fixture');\n")
        (source/"node_modules/.bin/tool").symlink_to("../pkg/program.js")
        record = PACK(source, self.archive)
        self.assertGreater(record["files"], 0)
        EXTRACT(self.archive, self.target)
        self.assertEqual((self.target/"node_modules/.bin/tool").read_bytes(), b"console.log('fixture');\n")
        self.assertTrue((self.target/"node_modules/.bin/tool").is_symlink())

    def test_extractor_cycle_is_path_free_domain_error(self):
        self.tar([("node_modules/a", "link", "b"), ("node_modules/b", "link", "a")])
        with self.assertRaisesRegex(ValueError, "^DEPENDENCY_LINK_RESOLUTION_DENIED$"):
            EXTRACT(self.archive, self.target)

    def test_extractor_dangling_link_is_path_free_domain_error(self):
        self.tar([("node_modules/a", "link", "missing")])
        with self.assertRaisesRegex(ValueError, "^DEPENDENCY_LINK_RESOLUTION_DENIED$"):
            EXTRACT(self.archive, self.target)

    def test_builder_cycle_is_path_free_domain_error(self):
        source = self.builder_root()
        (source/"node_modules/a").symlink_to("b")
        (source/"node_modules/b").symlink_to("a")
        with self.assertRaisesRegex(ValueError, "^DEPENDENCY_LINK_RESOLUTION_DENIED$"):
            PACK(source, self.archive)

    def test_builder_dangling_link_is_path_free_domain_error(self):
        source = self.builder_root()
        (source/"node_modules/a").symlink_to("missing")
        with self.assertRaisesRegex(ValueError, "^DEPENDENCY_LINK_RESOLUTION_DENIED$"):
            PACK(source, self.archive)

    def test_symlink_parent_denied_before_first_extraction_write(self):
        self.tar([("node_modules/a", "link", "b"), ("node_modules/a/file", "file", b"denied")])
        with self.assertRaisesRegex(ValueError, "DEPENDENCY_SYMLINK_PARENT_DENIED"):
            EXTRACT(self.archive, self.target)
        self.assertEqual(list(self.target.iterdir()), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
