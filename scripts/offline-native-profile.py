#!/usr/bin/env python3
"""Execute the signed selected native profile offline with explicit permission.

Requires a preloaded digest-bound Docker qualification image. Restores real Git
bundles and their dependency bytes; keeps original PAN464 identity/admission,
paired-runner and business-oracle checks unchanged. No network fetch or deploy.
"""
import argparse
import json
import os
from pathlib import Path
import posixpath
import runpy
import shutil
import subprocess
import sys
import tarfile
from types import SimpleNamespace

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
R = SimpleNamespace(**runpy.run_path(str(HERE/"offline-rescue.py")))
A = SimpleNamespace(**runpy.run_path(str(HERE/"offline-artifact.py")))
SOURCE = "c255df512ba86cf8c346c797bac5400bac1b6ab3"
CONSUMER = "72d9a4af87fbbc5b23cb52835cd2f85415b8ddc7"


def extract_dependencies(archive_path, destination):
    with tarfile.open(archive_path,"r:") as archive:
        entries = archive.getmembers()
        R.require(0 < len(entries) <= 100000, "DEPENDENCY_COUNT_DENIED")
        seen = set()
        links = set()
        total = 0
        for item in entries:
            R.relative_path(item.name)
            R.require(item.name.startswith("node_modules/") and item.name not in seen and
                      item.mode & 0o7000 == 0 and (item.isfile() or item.isdir() or item.issym()),
                      "DEPENDENCY_MEMBER_DENIED")
            seen.add(item.name)
            total += item.size
            R.require(0 <= item.size <= 64*1024*1024 and total <= 512*1024*1024, "DEPENDENCY_SIZE_DENIED")
            if item.issym():
                R.require(item.linkname and not item.linkname.startswith("/") and "\\" not in item.linkname,
                          "DEPENDENCY_LINK_DENIED")
                target = posixpath.normpath(posixpath.join(posixpath.dirname(item.name),item.linkname))
                R.require(target.startswith("node_modules/"), "DEPENDENCY_LINK_ESCAPE_DENIED")
                links.add(item.name)
        for name in seen:
            R.require(not any(parent.as_posix() in links for parent in Path(name).parents),
                      "DEPENDENCY_SYMLINK_PARENT_DENIED")
        R.require(not (destination/"node_modules").exists(), "DEPENDENCY_OVERWRITE_DENIED")
        # No extractall: every destination was validated before the first write.
        for item in entries:
            path = destination/item.name
            path.parent.mkdir(parents=True,exist_ok=True)
            if item.isdir():
                path.mkdir(exist_ok=True)
            elif item.issym():
                path.symlink_to(item.linkname)
            else:
                stream = archive.extractfile(item)
                R.require(stream is not None, "DEPENDENCY_CONTENT_REQUIRED")
                if stream is None:
                    raise ValueError("DEPENDENCY_CONTENT_REQUIRED")
                with path.open("xb") as target:
                    shutil.copyfileobj(stream,target)
                os.chmod(path,item.mode & 0o777)
        for name in links:
            path = destination/name
            R.require((destination/"node_modules") in path.resolve(strict=True).parents,
                      "DEPENDENCY_RESOLVED_LINK_ESCAPE_DENIED")


def run_profile(args):
    root = Path(args.root)
    state = R.inspect(root)
    R.require(state["outcome"] == "STABLE", "UPDATER_STABLE_REQUIRED")
    receipt = A.admit(root/"bundles"/state["operation"], root/"trust.json",
                      state["highestReservedVersion"]-1, state["lastVerifiedTime"])
    slot = root/"slots"/state["activeArtifact"]
    R.require(Path(__file__).resolve() == slot/"scripts/offline-native-profile.py", "SIGNED_SELECTED_ENTRYPOINT_REQUIRED")
    profile = R.decode(R.read(slot/"profile/profile.json"))
    R.require(isinstance(profile,dict) and set(profile) == {"schema","scope","gitSources","dependencies","runtime","entrypoint","nonclaims"} and
              profile["schema"] == "pansphaira.offline-native-profile/v1" and
              profile["scope"] == "LOCAL_SYNTHETIC_RETAINED_PAIR" and
              profile["entrypoint"] == "scripts/run-retained-pair-upgrade.mjs", "PROFILE_SCHEMA_DENIED")
    sources = profile["gitSources"]
    R.require(set(sources) == {"source","target","consumer"} and sources["source"]["commit"] == SOURCE and
              sources["consumer"]["commit"] == CONSUMER and sources["target"]["commit"] == receipt["metadata"]["sourceCommit"],
              "PROFILE_SOURCE_BINDING_DENIED")
    work = Path(args.owned_root)
    permission = Path(args.permission_file)
    output = Path(args.output)
    R.require(work.is_absolute() and work.resolve() == work and work.is_dir() and
              work.stat().st_uid == os.getuid() and not list(work.iterdir()), "EMPTY_OWNED_PROFILE_ROOT_REQUIRED")
    R.require(permission.is_absolute() and output.is_absolute() and not output.exists(), "EXPLICIT_PERMISSION_AND_OUTPUT_REQUIRED")
    for path in (work,permission,output):
        R.require(root != path and root not in path.parents and path not in root.parents, "PROFILE_CONTROL_SEPARATION_REQUIRED")
    R.require(work not in permission.parents and work not in output.parents and output.parent.resolve() == output.parent,
              "PROFILE_INPUT_OUTPUT_SEPARATION_REQUIRED")
    A.regular(permission)
    for name in ("inputs","home","tmp","native","internal-logs"):
        (work/name).mkdir(mode=0o700)
    env = {"PATH":os.environ.get("PATH","/usr/bin:/bin"),"HOME":str(work/"home"),"TMPDIR":str(work/"tmp"),
           "GIT_CONFIG_NOSYSTEM":"1","GIT_TERMINAL_PROMPT":"0","GIT_OPTIONAL_LOCKS":"0",
           "PYTHONDONTWRITEBYTECODE":"1"}
    serial = 0
    def command(arguments,cwd=None,timeout=240):
        nonlocal serial
        serial += 1
        result = subprocess.run(arguments,cwd=cwd,env=env,stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
        (work/"internal-logs"/f"{serial:03d}.log").write_bytes(result.stdout+result.stderr)
        R.require(result.returncode == 0,"PROFILE_COMMAND_FAILED_HELD")
        return result.stdout.decode().strip()
    runtime = profile["runtime"]
    image = runtime["preloadedQualificationImage"]
    R.require(isinstance(image,str) and image.startswith("sha256:") and R.HEX.fullmatch(image[7:]), "PROFILE_IMAGE_ID_DENIED")
    R.require(command(["docker","image","inspect","--format","{{.Id}}",image]) == image,"PRELOADED_IMAGE_IDENTITY_DENIED")
    R.require(command(["node","-p","JSON.stringify({node:process.version,abi:process.versions.modules,platform:process.platform,arch:process.arch})"])
              == json.dumps({"node":"v24.19.0","abi":"137","platform":"linux","arch":"x64"},separators=(",",":")),
              "PROFILE_HOST_NODE_REQUIRED")
    dependency = slot/"profile/dependencies.tar"
    R.require(R.sha(A.regular(dependency,256*A.LIMIT)) == profile["dependencies"]["sha256"],"DEPENDENCY_BYTES_DENIED")
    for name in ("source","target","consumer"):
        item = sources[name]
        bundle = slot/"profile"/(name+".bundle")
        data = A.regular(bundle,256*A.LIMIT)
        R.require(R.sha(data) == item["bundleSha256"] and len(data) == item["bundleSize"],"GIT_BUNDLE_BYTES_DENIED")
        destination = work/"inputs"/name
        command(["git","-c","core.hooksPath=/dev/null","clone","--quiet",str(bundle),str(destination)])
        R.require(command(["git","rev-parse","HEAD"],destination) == item["commit"] and
                  command(["git","rev-parse","HEAD^{tree}"],destination) == item["tree"] and
                  not command(["git","status","--porcelain=v1","--untracked-files=all"],destination),
                  "RESTORED_GIT_IDENTITY_DENIED")
        if name != "consumer":
            R.require(R.sha(R.read(destination/"package-lock.json")) == profile["dependencies"]["packageLockSha256"],
                      "RESTORED_DEPENDENCY_LOCK_DENIED")
            extract_dependencies(dependency,destination)
    target = work/"inputs/target"
    # Compile from the recovered sources using the preloaded image, offline.
    # The unchanged paired runner repeats its own fresh builds on both PANs.
    command(["docker","run","--rm","--network","none","--read-only","--user",f"{os.getuid()}:{os.getgid()}",
        "--cap-drop","ALL","--security-opt","no-new-privileges","--tmpfs","/scratch:rw,nosuid,nodev,mode=1777",
        "-v",f"{target}:/pan:rw","-w","/pan","-e","HOME=/scratch","-e","TMPDIR=/scratch",
        image,"npm","run","build","--silent"])
    actual_output = work/"native-result.json"
    arguments = ["node",str(target/profile["entrypoint"]),"--source",str(work/"inputs/source"),
        "--counterpart",str(work/"inputs/consumer"),"--owned-root",str(work/"native"),
        "--image-id",image,"--pan-head",sources["target"]["commit"],"--permission-file",str(permission),
        "--output",str(actual_output)]
    command(arguments,timeout=1800)
    observed = R.decode(R.read(actual_output))
    R.require(observed["classification"] == "LOCAL_SYNTHETIC_RETAINED_PAIR_EXECUTION" and
              observed["upgraded"]["outcome"] == "ACTIVE" and observed["postActivation"] is not None and
              observed["recovery"]["outcome"] == "HELD_NO_AUTOMATIC_RESTORE", "NATIVE_PROFILE_QUALIFICATION_FAILED")
    rescue = R.inspect_retained_pair(work/"native")
    R.require(rescue["phase"] == "ACTIVE_WITH_NEW_WRITES" and rescue["reservationStates"] == ["APPLIED"],
              "NATIVE_STANDALONE_RESCUE_FAILED")
    result = {"schema":"pansphaira.offline-native-execution/v1","outcome":"PASS",
        "artifactSha256":state["activeArtifact"],"metadataSha256":state["operation"],"sources":sources,
        "runtime":runtime,"dependencySha256":profile["dependencies"]["sha256"],"nativeExit":0,
        "actualEntryPoint":"scripts/run-retained-pair-upgrade.mjs","pairedResults":observed["pairs"],
        "sourceDataPreserved":observed["source"]["producer"]["dataDigest"] == observed["upgraded"]["observed"]["producer"]["dataDigest"],
        "postActivationWritesObserved":True,"standaloneRescue":rescue,
        "nonclaims":["LOCAL_SYNTHETIC_ONLY","PRELOADED_IMAGE_PREREQUISITE","NO_PRODUCTION_OR_HOST_SANDBOX",
                     "NO_REGISTRY_SIGNATURE_ASSERTION","NO_POWER_LOSS_QUALIFICATION","NOT_PUBLICATION_AUTHORITY"]}
    R.require(result["sourceDataPreserved"],"SOURCE_DATA_NOT_PRESERVED")
    with output.open("xb") as stream:
        stream.write(R.encoded(result))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("root","owned-root","permission-file","output"):
        parser.add_argument("--"+name,required=True)
    args = parser.parse_args()
    fd = None
    try:
        updater = SimpleNamespace(**runpy.run_path(str(HERE/"offline-updater.py")))
        fd = updater.lock(updater.owned_root(args.root))
        result = run_profile(args)
    except (ValueError,OSError,TypeError,KeyError,subprocess.SubprocessError,tarfile.TarError):
        print(json.dumps({"outcome":"PROFILE_HELD", "automaticRestore":False}))
        return 1
    finally:
        if fd is not None:
            os.close(fd)
    print(json.dumps(result,sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
