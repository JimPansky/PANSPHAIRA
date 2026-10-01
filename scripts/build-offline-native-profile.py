#!/usr/bin/env python3
"""Build one offline native-updater profile from actual immutable Git checkouts.

Additive profile builder: no change to the ordinary public-file allowlist.
Bundles contain actual shallow Git objects, never caller-written commit IDs.
Dependencies are byte-bound local inputs; registry signatures are not asserted.
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import runpy
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
from types import SimpleNamespace

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
R = SimpleNamespace(**runpy.run_path(str(HERE/"offline-rescue.py")))
SOURCE = "c255df512ba86cf8c346c797bac5400bac1b6ab3"
CONSUMER = "72d9a4af87fbbc5b23cb52835cd2f85415b8ddc7"
NODE = "node:24.19.0-bookworm@sha256:4196d66a565c6f195728d9952f161f4adfe2ad753052a08b7ec7f1c5a6bda42b"
SUPERSET = "apache/superset:6.1.0@sha256:fb3464528ec7076f91195f0ff7835755aa023e281f1bb78a84782ce7a36b3705"
FILES = ("offline-artifact.py", "offline-rescue.py", "offline-updater.py", "offline-native-profile.py")


def command(args, cwd=None):
    return subprocess.check_output(args, cwd=cwd, stdin=subprocess.DEVNULL,
        stderr=subprocess.PIPE, timeout=180, env={"PATH":"/usr/bin:/bin", "HOME":os.environ.get("TMPDIR", "/nonexistent"),
        "GIT_CONFIG_NOSYSTEM":"1", "GIT_TERMINAL_PROMPT":"0", "GIT_OPTIONAL_LOCKS":"0"}).decode().strip()


def checkout(path, expected=None):
    path = Path(path)
    R.require(path.is_absolute() and path.resolve() == path, "EXACT_CHECKOUT_PATH_REQUIRED")
    R.require(command(["git","rev-parse","--show-toplevel"], path) == str(path), "CHECKOUT_ROOT_REQUIRED")
    commit = command(["git","rev-parse","HEAD"], path)
    R.require(expected is None or commit == expected, "PROFILE_SOURCE_SUBSTITUTION_DENIED")
    R.require(not command(["git","status","--porcelain=v1","--untracked-files=all"], path), "CLEAN_IMMUTABLE_CHECKOUT_REQUIRED")
    return {"commit":commit, "tree":command(["git","rev-parse","HEAD^{tree}"], path)}


def shallow_bundle(source, expected, stage, name):
    # Git itself transports the authentic commit/tree/blob graph from the
    # existing clean checkout. No fabricated .git/HEAD, commit or tree objects.
    bare = stage/(name+"-bare")
    command(["git","clone","--quiet","--bare","--no-local","--depth","1",source.as_uri(),str(bare)])
    R.require(command(["git","rev-parse","HEAD"],bare) == expected["commit"], "CLONE_HEAD_CHANGED_DENIED")
    output = stage/(name+".bundle")
    command(["git","bundle","create",str(output),"HEAD"],bare)
    command(["git","bundle","verify",str(output)],bare)
    # Confirm a real fresh offline clone reconstructs the same commit and tree.
    restored = stage/(name+"-readback")
    command(["git","-c","core.hooksPath=/dev/null","clone","--quiet",str(output),str(restored)])
    R.require(checkout(restored,expected["commit"]) == expected, "BUNDLE_READBACK_DENIED")
    return output


def dependencies(root, output):
    dependencies = root/"node_modules"
    R.require(dependencies.is_dir() and not dependencies.is_symlink(), "REAL_DEPENDENCY_DIRECTORY_REQUIRED")
    # No symlink can escape the frozen dependency closure. Archive extraction
    # separately validates all member/link paths before writing.
    total = 0
    count = 0
    with tarfile.open(output,"w",format=tarfile.GNU_FORMAT) as archive:
        for path in sorted(dependencies.rglob("*")):
            relative = path.relative_to(root).as_posix()
            R.relative_path(relative)
            if path.is_symlink():
                R.require(dependencies in path.resolve(strict=True).parents, "DEPENDENCY_LINK_ESCAPE_DENIED")
            elif path.is_file():
                total += path.stat().st_size
            else:
                R.require(path.is_dir(), "DEPENDENCY_SPECIAL_FILE_DENIED")
            count += 1
            R.require(count <= 100000 and total <= 512*1024*1024, "DEPENDENCY_BOUND_DENIED")
            info = archive.gettarinfo(str(path), arcname=relative)
            info.uid = info.gid = 0
            info.uname = info.gname = ""
            info.mtime = 0
            info.mode &= 0o777
            if info.isfile():
                with path.open("rb") as stream:
                    archive.addfile(info,stream)
            else:
                archive.addfile(info)
    return {"sha256":R.sha(output.read_bytes()), "size":output.stat().st_size,
            "packageLockSha256":R.sha(R.read(root/"package-lock.json")), "files":count}


def build(args):
    target = HERE.parent
    source = Path(args.source)
    consumer = Path(args.consumer)
    identities = {"target":checkout(target), "source":checkout(source,SOURCE), "consumer":checkout(consumer,CONSUMER)}
    R.require(isinstance(args.image_id,str) and args.image_id.startswith("sha256:") and
              R.HEX.fullmatch(args.image_id[7:]), "IMAGE_DIGEST_REQUIRED")
    R.require(command(["docker","image","inspect","--format","{{.Id}}",args.image_id]) == args.image_id,
              "PRELOADED_IMAGE_REQUIRED")
    output = Path(args.output)
    R.require(output.is_absolute() and not output.exists() and output.parent.resolve() == output.parent,
              "NEW_ABSOLUTE_OUTPUT_REQUIRED")
    for root in (target,source,consumer):
        R.require(root not in output.parents and output not in root.parents, "OUTPUT_OUTSIDE_INPUTS_REQUIRED")
    output.mkdir(mode=0o700)
    # TMPDIR is caller-owned scratch, never a machine-global package/cache path.
    with tempfile.TemporaryDirectory(prefix="pan465-profile-",dir=os.environ.get("TMPDIR")) as temporary:
        stage = Path(temporary).resolve()
        entries = {}
        git_sources = {}
        for name, root in (("target",target),("source",source),("consumer",consumer)):
            path = shallow_bundle(root,identities[name],stage,name)
            entries[f"profile/{name}.bundle"] = path
            git_sources[name] = {**identities[name],"bundleSha256":R.sha(path.read_bytes()),"bundleSize":path.stat().st_size}
        dependency_path = stage/"dependencies.tar"
        dependency = dependencies(target,dependency_path)
        R.require(R.sha(R.read(source/"package-lock.json")) == dependency["packageLockSha256"],
                  "SOURCE_TARGET_DEPENDENCY_LOCK_MISMATCH")
        entries["profile/dependencies.tar"] = dependency_path
        for name in FILES:
            entries["scripts/"+name] = target/"scripts"/name
        profile = {"schema":"pansphaira.offline-native-profile/v1", "scope":"LOCAL_SYNTHETIC_RETAINED_PAIR",
            "gitSources":git_sources, "dependencies":dependency,
            "runtime":{"platform":"linux", "arch":"x64", "node":"v24.19.0", "abi":"137",
                       "nodeOci":NODE, "supersetOci":SUPERSET, "preloadedQualificationImage":args.image_id},
            "entrypoint":"scripts/run-retained-pair-upgrade.mjs",
            "nonclaims":["NO_PRODUCTION_AUTHORITY", "PRELOADED_DOCKER_IMAGE_IS_EXPLICIT_PREREQUISITE",
                         "DEPENDENCY_BYTES_BOUND_NOT_REGISTRY_SIGNATURE", "NO_POWER_LOSS_QUALIFICATION"]}
        profile_path = stage/"profile.json"
        profile_path.write_bytes(R.encoded(profile))
        entries["profile/profile.json"] = profile_path
        with tarfile.open(output/"artifact.tar","w",format=tarfile.USTAR_FORMAT) as archive:
            for name,path in sorted(entries.items()):
                data = path.read_bytes()
                info = tarfile.TarInfo(name)
                info.size = len(data)
                info.mode = 0o644
                archive.addfile(info,io.BytesIO(data))
        # Both originals must remain clean and unchanged after building.
        for name,root in (("target",target),("source",source),("consumer",consumer)):
            R.require(checkout(root,identities[name]["commit"]) == identities[name], "BUILD_INPUT_CHANGED_DENIED")
    record = {"schema":"pansphaira.offline-profile-build/v1", "sourceCommit":identities["target"]["commit"],
              "sourceTree":identities["target"]["tree"], "artifactSha256":R.sha((output/"artifact.tar").read_bytes()),
              "artifactSize":(output/"artifact.tar").stat().st_size, "profile":profile,
              "signed":False, "runtimeQualified":False, "publicationAuthorized":False}
    (output/"build.json").write_bytes(R.encoded(record))
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source",required=True)
    parser.add_argument("--consumer",required=True)
    parser.add_argument("--image-id",required=True)
    parser.add_argument("--output",required=True)
    args = parser.parse_args()
    try:
        result = build(args)
    except (ValueError,OSError,TypeError,KeyError,subprocess.SubprocessError,tarfile.TarError):
        print(json.dumps({"outcome":"BUILD_DENIED", "runtimeQualified":False}))
        return 1
    print(json.dumps(result,sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
