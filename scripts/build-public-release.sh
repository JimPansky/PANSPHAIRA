#!/usr/bin/env bash
set -euo pipefail

export LC_ALL=C
umask 022

usage() {
  printf 'Usage: %s --output /absolute/path\n' "$0" >&2
}

output=""
while (($#)); do
  case "$1" in
    --output)
      (($# >= 2)) || { usage; exit 64; }
      output="$2"
      shift 2
      ;;
    *)
      usage
      exit 64
      ;;
  esac
done

[[ "$output" == /* && "$output" != "/" ]] || {
  printf 'Output must be an absolute non-root path.\n' >&2
  exit 64
}

for command_name in python3 realpath install find sort sha256sum touch tar gzip mkdir mv; do
  command -v "$command_name" >/dev/null || {
    printf 'Missing required command: %s\n' "$command_name" >&2
    exit 69
  }
done

script_path="$(realpath -e -- "$0")"
source_root="$(realpath -e -- "$(dirname -- "$script_path")/..")"
manifest="$source_root/release/public-files.manifest"
[[ -f "$manifest" && ! -L "$manifest" ]] || {
  printf 'Manifest missing or unsafe.\n' >&2
  exit 66
}

output_parent="$(dirname -- "$output")"
output_name="$(basename -- "$output")"
[[ "$output_name" =~ ^cm-product-increment-rc-[0-9]{8}([-.][A-Za-z0-9.-]+)?$ ]] || {
  printf 'Output basename is outside the release naming contract.\n' >&2
  exit 64
}
mkdir -p -- "$output_parent"
output_parent="$(realpath -e -- "$output_parent")"
output="$output_parent/$output_name"
archive="$output.tar.gz"
marker="$output.cm-public-release-marker"

for path in "$output" "$archive" "$marker"; do
  [[ ! -e "$path" && ! -L "$path" ]] || {
    printf 'Output path already exists: %s\n' "$path" >&2
    exit 73
  }
done

case "$output/" in
  "$source_root/"*) printf 'Output must be outside the source tree.\n' >&2; exit 64 ;;
esac
case "$source_root/" in
  "$output/"*) printf 'Output must not contain the source tree.\n' >&2; exit 64 ;;
esac

python3 - "$source_root" "$manifest" <<'PY'
import os
import pathlib
import re
import stat
import sys
import unicodedata

root = pathlib.Path(sys.argv[1]).resolve(strict=True)
manifest = pathlib.Path(sys.argv[2])
destinations: set[str] = set()
casefolded: set[str] = set()
total_bytes = 0
count = 0
denied_parts = {
    ".git", ".github", ".idea", ".vscode", "__pycache__", "node_modules",
    "reports", "reviews", "evidence", "working", "backups", "logs", "dist",
}
denied_suffixes = {
    ".bak", ".backup", ".env", ".log", ".orig", ".pyc", ".swp", ".tmp",
    ".zip", ".tar", ".tgz", ".gz", ".bz2", ".xz", ".7z",
}
text_suffixes = {
    "", ".css", ".dockerfile", ".html", ".ini", ".js", ".json", ".md",
    ".mjs", ".py", ".sh", ".svg", ".ts", ".txt", ".yaml", ".yml", ".cff",
}
secret_patterns = {
    "private_key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "github_token": re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b"),
    "gitlab_token": re.compile(r"\bglpat-[A-Za-z0-9_-]{20,}\b"),
    "openai_key": re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"),
    "huggingface_token": re.compile(r"\bhf_[A-Za-z0-9]{20,}\b"),
    "telegram_token": re.compile(r"\b[0-9]{8,12}:[A-Za-z0-9_-]{30,}\b"),
    "aws_access_key": re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"),
    "jwt": re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"),
    "credential_url": re.compile(r"https?://[^/\s:@]+:[^/\s@]+@"),
    "literal_secret": re.compile(
        r"(?i)\b(?:password|passwd|api[_-]?key|client[_-]?secret|access[_-]?token|session[_-]?token)"
        r"\s*[:=]\s*['\"][^'\"\s]{16,}['\"]"
    ),
}
private_path_patterns = {
    "home_absolute_path": re.compile(r"/home/[A-Za-z0-9._-]+(?:/|\b)"),
    "mnt_absolute_path": re.compile(r"/mnt/(?!source(?:/|\b))[A-Za-z0-9._-]+(?:/|\b)"),
    "agent_session_identifier": re.compile(r"\bagent:[A-Za-z0-9._-]+:[A-Za-z0-9._:-]+\b"),
}
content_quality_patterns = {
    "old_release_blocker_label": re.compile(r"\b" + "NO" + r"_GO\b"),
    "transition_source_mirror": re.compile(r"(?:^|[\s`'\"])" + "release/" + r"public/"),
    "german_canon": re.compile(r"CANON[.]de[.]md"),
}
unsuitable_terms = [
    "4" + "chan",
    "troll" + "ing",
    "ridi" + "cule",
    "brand " + "provocation",
    "viral " + "misuse",
]
content_quality_patterns["unsuitable_public_invitation"] = re.compile(
    r"\b(?:" + "|".join(re.escape(term) for term in unsuitable_terms) + r")\b",
    re.I,
)
disallowed_exact = {
    ".github/funding.yml",
    "docs/canon.de.md",
}

for line_number, raw in enumerate(manifest.read_text("utf-8").splitlines(), 1):
    if not raw or raw.startswith("#"):
        continue
    fields = raw.split("\t")
    if len(fields) != 3:
        raise SystemExit(f"MANIFEST_FIELDS:{line_number}")
    source, destination, mode = fields
    count += 1
    if source != destination:
        raise SystemExit(f"NON_IDENTITY_MAPPING:{line_number}")
    for label, value in (("SOURCE", source), ("DESTINATION", destination)):
        if (
            not value
            or value.startswith("/")
            or "\\" in value
            or "\0" in value
            or value != unicodedata.normalize("NFC", value)
            or not re.fullmatch(r"[A-Za-z0-9._/-]+", value)
            or any(part in {"", ".", ".."} for part in value.split("/"))
        ):
            raise SystemExit(f"UNSAFE_{label}:{line_number}")
    if mode not in {"0644", "0755"}:
        raise SystemExit(f"UNSAFE_MODE:{line_number}")
    parts = set(destination.split("/"))
    lower_destination = destination.lower()
    if (
        parts & denied_parts
        or any(lower_destination.endswith(suffix) for suffix in denied_suffixes)
        or lower_destination.startswith(".chimpmaera-")
        or lower_destination.startswith("release/" + "public/")
        or lower_destination in disallowed_exact
    ):
        raise SystemExit(f"DENIED_DESTINATION:{line_number}")
    if destination in destinations or destination.casefold() in casefolded:
        raise SystemExit(f"DUPLICATE_DESTINATION:{line_number}")
    destinations.add(destination)
    casefolded.add(destination.casefold())
    candidate = root / source
    current = root
    for part in pathlib.PurePosixPath(source).parts:
        current = current / part
        if current.is_symlink():
            raise SystemExit(f"SYMLINK_SOURCE:{line_number}")
    resolved = candidate.resolve(strict=True)
    if os.path.commonpath((str(root), str(resolved))) != str(root):
        raise SystemExit(f"SOURCE_ESCAPE:{line_number}")
    metadata = resolved.stat()
    if not stat.S_ISREG(metadata.st_mode):
        raise SystemExit(f"NONREGULAR_SOURCE:{line_number}")
    if metadata.st_mode & (stat.S_ISUID | stat.S_ISGID):
        raise SystemExit(f"PRIVILEGED_SOURCE_MODE:{line_number}")
    total_bytes += metadata.st_size

if count != 1792:
    raise SystemExit("MANIFEST_FILE_COUNT")
if total_bytes > 100 * 1024 * 1024:
    raise SystemExit("MANIFEST_BYTE_LIMIT")

expected = set(destinations)
repository_only_files = {
    # PAN574 original contexts, independent examples and native export are source-only.
    "src/pan471/composition-bindings.mjs",
    "scripts/run-pan574-composition-contracts.mjs",
    "tests/pan471/composition-bindings.test.mjs",
    "docs/architecture/pan574-composition-bindings-v1.md",
    "contracts/pan574/public-examples-v1.json",
    "contracts/pan574/original-context-v1/D0/manifest.json",
    "contracts/pan574/original-context-v1/D0/material-input-original.txt",
    "contracts/pan574/original-context-v1/D0/material-authority-original.txt",
    "contracts/pan574/original-context-v1/D0/erp-profile-original.schema.json",
    "contracts/pan574/original-context-v1/D0/inventory-boundary-original.txt",
    "contracts/pan574/original-context-v1/S/manifest.json",
    # PAN576 finite separated workload is source-only, not a legacy runnable entry.
    "scripts/pan576-kernel-guard.c",
    "scripts/pan576-isolated-worker.mjs",
    "src/pan471/composition-execution.mjs",
    "tests/pan471/composition-execution.test.mjs",
    "docs/architecture/pan576-isolated-composition-execution-v1.md",
    # PAN572 uninstall regression is repository source, not a runnable payload entry.
    "tests/demo-current-head-e2e-uninstall.test.mjs",
    "HANDOFF.md",
    "TASKS.md",
    ".github/FUNDING.yml",
    ".github/workflows/daily-poc-candidate.yml",
    "SHA256SUMS",
    "WORK_RESULT.md",
    "tests/trust-compatibility-foundation-closure.test.ts",
    "tests/delivery-contract-template.test.mjs",
    "verification/external-bi-service-paired-compatibility-v1.json",
    "verification/paired-analytics-compatibility-v1.json",
    "verification/ps391-temporal-focused-receipt-v1.json",
    "verification/trust-compatibility-foundation-closure-v1.json",
    "tests/fixtures/local-knowledge-wiki-container/credential-like.env",
    "tests/fixtures/rks-01/raw-rag-corpus-v1.json",
    "tests/fixtures/rks-01/typed-knowledge-corpus-v1.json",
    "tests/fixtures/rks-01/model-runtime-manifest-v1.json",
    "verification/rks-01-comparator-receipt-v1.json",
    "tests/fixtures/rks-02/model-runtime-manifest-v1.json",
    "verification/rks-02-comparator-receipt-v1.json",
    "tests/fixtures/cscl-02/odoo-community-source-bundle-v1.json",
    "tests/fixtures/cscl-03/source-capture-manifest-v1.json",
    "tests/fixtures/cscl-04/dolibarr-24.0.0-capture-v1.json",
    "tests/fixtures/cscl-05/source-members-v1.json",
    "tests/fixtures/cscl-06/official-source-corpus-v1.json",
    "docs/development/cscl-02-odoo-community-profile-v1.md",
    "docs/development/cscl-03-erpnext-profile-v1.md",
    "docs/development/cscl-04-dolibarr-24.0.0-profile.md",
    "docs/development/cscl-05-tryton-source-native-profile-v1.md",
    "docs/development/cscl-06-apache-ofbiz-profile-v1.md",
    "tests/fixtures/cscl-07/expected-matrix-v1.json",
    # PAN442/452 bound business task & opaque tool handle capability — repository-only
    # (delivered via the SOURCE_EVIDENCE_ONLY real GitHub source archive, not the
    # runnable product-increment file set). Declared here so the fail-closed
    # completeness gate classifies them; they are NOT added to release/public-files.manifest.
    "src/pan442/bound-task-handle.mjs",
    "tests/pan442/bound-task-handle.test.mjs",
    "schemas/contracts/pan442-bound-task-handle-v1.schema.json",
    "docs/architecture/pan442-bound-task-handle-v1.md",
    "verification/pan442-bound-task-handle-boundary-v1.json",
    # PAN454 finite task-journey conformance/falsification consumer. All are
    # repository-only SOURCE_EVIDENCE_ONLY, like the retained BTH seam; no
    # runnable product capability or isolation promotion from negative evidence.
    "src/pan454/journey-profile.mjs",
    "src/pan454/journey-canary.mjs",
    "scripts/run-pan454-journey-evidence.mjs",
    "tests/pan454/journey-mediation-evidence.test.mjs",
    "docs/architecture/pan454-journey-mediation-evidence-v1.md",
    # PAN360 original functional ERV source increment. Actual synthetic execution
    # evidence is shipped in the source archive; no runnable product promotion.
    "docs/architecture/pan360-original-erv-execution-v1.md",
    "scripts/run-pan360-original-erv.mjs",
    "src/pan360/original-erv-core-v1.mjs",
    "src/pan360/original-invoice-input-v1.mjs",
    "src/pan360/original-erv-execution-v1.mjs",
    "src/pan360/original-erv-report-v1.mjs",
    "tests/pan360/original-execution-regression.test.mjs",
    "tests/pan360/original-core-qualification.test.mjs",
    "tests/pan360/original-composition.test.mjs",
    "tests/pan360/original-report.test.mjs",
    "tests/pan360/original-registration.test.mjs",
    "tests/fixtures/pan360/original-erv-profile-v1.json",
    "tests/fixtures/pan360/invoice-high-v1.txt",
    "tests/fixtures/pan360/invoice-below-v1.txt",
    "tests/fixtures/pan360/invoice-equal-v1.txt",
    "tests/fixtures/pan360/invoice-above-v1.txt",
    "verification/pan360-original-erv-execution-v1.json",
    # PAN378 exact post-freeze disclosed real-OCR falsification evidence/replay.
    # Separate reviewed custody bundle only, no private originals or runnable promotion.
    "docs/architecture/pan378-spent-pilot-reproduction-v3.md",
    "scripts/run-pan378-spent-pilot.mjs",
    "src/pan378/spent-pilot-replay-v3.mjs",
    "tests/pan378/spent-pilot-replay.test.mjs",
    "tests/pan378/spent-pilot-admission.test.mjs",
    "tests/pan378/spent-pilot-registration.test.mjs",
    "tests/fixtures/pan378/spent-evaluation-v3/packet-manifest.json",
    "tests/fixtures/pan378/spent-evaluation-v3/new-epoch-v3-evaluated-custody.bundle",
    "tests/fixtures/pan378/spent-evaluation-v3/report-v3.json",
    "verification/pan378-spent-pilot-reproduction-v3.json",
    # Exact admitted ERV workflow evidence paths: source archive only, not
    # runnable payload. No evidence/ or tests/ prefix exemption is introduced.
    "docs/architecture/erv-workflow-native-evidence-v1.md",
    "evidence/erv-workflow/reference-v1/README.de.md",
    "evidence/erv-workflow/reference-v1/field-matrix.csv",
    "evidence/erv-workflow/reference-v1/independent-expectations.json",
    "evidence/erv-workflow/reference-v1/native-adjudication-v5.json",
    "evidence/erv-workflow/reference-v1/native-evidence-v5/core-allocations-extra.json",
    "evidence/erv-workflow/reference-v1/native-evidence-v5/core-cost-center-extra.json",
    "evidence/erv-workflow/reference-v1/native-evidence-v5/core-entity-extra.json",
    "evidence/erv-workflow/reference-v1/native-evidence-v5/core-project-extra.json",
    "evidence/erv-workflow/reference-v1/native-evidence-v5/intake-action-extra.json",
    "evidence/erv-workflow/reference-v1/native-evidence-v5/intake-cost-center-extra.json",
    "evidence/erv-workflow/reference-v1/native-evidence-v5/lean-mandatory-approval.json",
    "evidence/erv-workflow/reference-v1/native-evidence-v5/native-above.json",
    "evidence/erv-workflow/reference-v1/native-evidence-v5/native-below.json",
    "evidence/erv-workflow/reference-v1/native-evidence-v5/native-boundary200.json",
    "evidence/erv-workflow/reference-v1/native-evidence-v5/native-cost-center-actor.json",
    "evidence/erv-workflow/reference-v1/native-evidence-v5/native-currency-conflict.json",
    "evidence/erv-workflow/reference-v1/native-evidence-v5/native-duplicate-intake.json",
    "evidence/erv-workflow/reference-v1/native-evidence-v5/native-equal.json",
    "evidence/erv-workflow/reference-v1/native-evidence-v5/native-lean.json",
    "evidence/erv-workflow/reference-v1/native-evidence-v5/native-missing-receipt.json",
    "evidence/erv-workflow/reference-v1/native-evidence-v5/native-modified-pending.json",
    "evidence/erv-workflow/reference-v1/native-evidence-v5/native-observations.json",
    "evidence/erv-workflow/reference-v1/native-evidence-v5/native-outside200.json",
    "evidence/erv-workflow/reference-v1/native-evidence-v5/native-productive-effect.json",
    "evidence/erv-workflow/reference-v1/native-evidence-v5/native-quantity-conflict.json",
    "evidence/erv-workflow/reference-v1/native-evidence-v5/native-self-actor.json",
    "evidence/erv-workflow/reference-v1/native-evidence-v5/native-synthetic-approval.json",
    "evidence/erv-workflow/reference-v1/native-evidence-v5/native-tampered-document.json",
    "evidence/erv-workflow/reference-v1/packet-manifest.json",
    "evidence/erv-workflow/reference-v1/probe-existing-poc.mjs",
    "evidence/erv-workflow/reference-v1/research-design-examples.json",
    "evidence/erv-workflow/reference-v1/research-sources.json",
    "evidence/erv-workflow/reference-v1/scenario-catalog.json",
    "evidence/erv-workflow/reference-v1/workflow-field-role-matrix.json",
    "evidence/erv-workflow/reference-v1/workflow-matrix.csv",
    "evidence/erv-workflow/reference-v1/workflow-research.de.md",
    "evidence/erv-workflow/released-kernel-bindings-v1.json",
    "scripts/run-erv-workflow-evidence.mjs",
    "src/erv-workflow-evidence/native-evidence-v1.mjs",
    "tests/erv-workflow-evidence/native-evidence.test.mjs",
    "tests/erv-workflow-evidence/registration.test.mjs",
    "tests/erv-workflow-evidence/source-admission.test.mjs",
    "verification/erv-workflow-native-evidence-v1.json",
    # PAN396 first admitted socket-free synthetic S3/SQS lab: exact source-only
    # paths, no raw retained state or broad tests/evidence exception.
    "docs/architecture/pan396-original-s3-sqs-lab-v1.md",
    "packages/contracts/src/floci-invoice-lab-v1.ts",
    "src/pan396/floci-http-v1.mjs",
    "src/pan396/invoice-broker-v1.mjs",
    "src/pan396/simplest-fake-v1.mjs",
    "src/pan396/disabled-ui-proof-v1.mjs",
    "scripts/pan396-original-s3-sqs-proof-v1.mjs",
    "scripts/pan396-owned-floci-runtime-v1.mjs",
    "scripts/pan396-owned-cleanup-v1.mjs",
    "tests/pan396/invoice-broker.test.mjs",
    "tests/pan396/disabled-ui.test.mjs",
    "tests/pan396/registration.test.mjs",
    "tests/fixtures/pan396/floci-pin-v1.json",
    "verification/pan396-original-s3-sqs-evidence-v1.json",
    # PAN515 additive native trade: bounded source evidence only, no raw grants/runtime.
    "contracts/trade/common-trade-01-v1.json",
    "src/pan515/trade-state.mjs",
    "scripts/run-pan515-trade-state.mjs",
    "tests/fixtures/pan515/native-trade-fixture.mjs",
    "tests/fixtures/pan515/native-trade-client.mjs",
    "tests/pan515/native-trade-state.test.mjs",
    "tests/pan515/common-trade-binding.test.mjs",
    "tests/pan515/common-native-events.test.mjs",
    "tests/pan515/native-trade-negative.test.mjs",
    "tests/pan515/native-process-compatibility.test.mjs",
    "tests/pan515/native-cli.test.mjs",
    "tests/pan515/registration.test.mjs",
    "docs/architecture/pan515-native-trade-state-v1.md",
    "verification/pan515-native-trade-evidence-v1.json",
    # PAN516 bounded native purchase source evidence; legacy demo remains standalone.
    "contracts/trade/pan516-invoice-cases-v1.json",
    "src/procurement-434/bestellung-lifecycle.mjs",
    "src/procurement-434/bestellung-liability.mjs",
    "src/procurement-434/bestellung-cli.mjs",
    "tests/procurement-434/procurement-lifecycle.test.mjs",
    "tests/procurement-434/procurement-registration.test.mjs",
    "docs/architecture/pan516-native-procurement-v1.md",
    "verification/pan516-native-procurement-evidence-v1.json",
    # PAN517 bounded fulfilment source evidence only; no grants or raw native state.
    "src/pan517/fulfilment-state.mjs",
    "src/pan517/delivery-milestones.mjs",
    "tests/pan517/native-fulfilment.test.mjs",
    "tests/pan517/calendar-integrity.test.mjs",
    "tests/pan517/registration.test.mjs",
    "docs/architecture/pan517-native-fulfilment-v1.md",
    "verification/pan517-native-fulfilment-evidence-v1.json",
    # PAN524 current exact pair qualification remains source evidence, not a standalone runtime.
    "scripts/verify-pan524-exact-bi-pair-v1.mjs",
    "tests/fixtures/pan524/published-j02-provider-v0181.json",
    "tests/fixtures/pan524/published-plan-extraction-response-v1.json",
    "tests/fixtures/pan524/published-preview-response-v1.json",
    "tests/pan524/exact-bi-pair-profile.test.mjs",
    "tests/pan524/delivery-surface.test.mjs",
    "tests/pan524/registration.test.mjs",
    "verification/pan524-exact-bi-pair-evidence-v1.json",
    # PAN520 bounded typed native projections: source evidence only, no paired/authority promotion.
    "contracts/trade/pan520-projection-contract-v1.json",
    "src/pan520/native-projection.mjs",
    "tests/pan520/native-projection.test.mjs",
    "tests/pan520/native-procurement-projection.test.mjs",
    "tests/pan520/registration.test.mjs",
    "docs/architecture/pan520-native-projections-v1.md",
    "verification/pan520-native-projection-evidence-v1.json",
    # PAN525 read-only local qualification: source archive only, no runnable promotion.
    "contracts/pan525/exact-pair-qualification-v1.json",
    "contracts/pan525/native-persistence-observation-v1.json",
    "contracts/pan525/native-runtime-version-readback-v1.json",
    "src/pan525/exact-pair-qualification.mjs",
    "scripts/read-pan525-qualified-pair-v1.mjs",
    "tests/pan525/exact-pair-qualification.test.mjs",
    "tests/pan525/registration.test.mjs",
    "docs/architecture/pan525-exact-qualified-pair-v1.md",
    "verification/pan525-exact-qualified-pair-evidence-v1.json",
    # PAN526 portable local runtime source/evidence only; legacy runnable payload unchanged.
    "contracts/runtime-portability/candidates/runtime-identity-development-v1.schema.json",
    "contracts/runtime-portability/candidates/runtime-identity-development-v2.schema.json",
    "contracts/runtime-portability/candidates/portable-runtime-development-v1.schema.json",
    "contracts/runtime-portability/portable-runtime-v1.schema.json",
    "src/pan526/runtime-contract.mjs",
    "src/pan526/local-runtime-adapter.mjs",
    "scripts/read-pan526-portable-local-runtime-v1.mjs",
    "tests/pan526/ks-node-agent-candidate.test.mjs",
    "tests/pan526/runtime-contract.test.mjs",
    "tests/pan526/local-runtime-adapter.test.mjs",
    "tests/pan526/local-runtime-cli.test.mjs",
    "tests/pan526/local-runtime-native.test.mjs",
    "tests/pan526/registration.test.mjs",
    "docs/architecture/pan526-runtime-identity-development-v1.md",
    "docs/architecture/pan526-runtime-identity-development-v2.md",
    "docs/architecture/pan526-portable-runtime-development-v1.md",
    "docs/architecture/pan526-portable-local-runtime-v1.md",
    "verification/pan526-portable-runtime-evidence-v1.json",
    "verification/pan526-cold-start-resource-raw-v1.json",
    # PAN529 controller/template remain source evidence only. The runtime store
    # is explicitly packaged; shared broker export membership stays unchanged.
    "src/pan529/runtime-template-contract.mjs",
    "src/pan529/native-budget-controller.mjs",
    "contracts/runtime-budget/candidates/runtime-budget-development-v1.json",
    "scripts/run-pan529-runtime-budget-tests.mjs",
    "docs/architecture/pan529-runtime-budget-v1.md",
    "tests/pan529/atomic-resource-budget.test.mjs",
    "tests/pan529/broker-equal-key.test.mjs",
    "tests/pan529/reservation-worker.mjs",
    "tests/pan529/runtime-template.test.mjs",
    "tests/pan529/unknown-usage-process.mjs",
    "tests/pan529/native-receipt-cache.test.mjs",
    "tests/pan529/native-controller.test.mjs",
    "tests/pan529/native-fixture.mjs",
    "tests/pan529/native-process-integration.test.mjs",
    "tests/pan529/native-provider-worker.mjs",
    "tests/pan529/registration.test.mjs",
    "tests/pan529/test-runner.test.mjs",
    # PAN527 optional origin/session source/evidence only, not a turnkey hosted payload.
    "contracts/hosted-origin-session/candidates/origin-session-development-v1.json",
    "contracts/hosted-origin-session/candidates/origin-session-development-v2.json",
    "contracts/hosted-origin-session/candidates/origin-session-development-v3.json",
    "contracts/hosted-origin-session/protected-route-binding-v1.schema.json",
    "src/pan527/origin-session-adapter.mjs",
    "scripts/run-pan527-origin-session-tests.mjs",
    "tests/pan527/bound-session-native.test.mjs",
    "tests/pan527/browser-native-network.test.mjs",
    "tests/pan527/control-route-binding.test.mjs",
    "tests/pan527/csrf-native-mutation.test.mjs",
    "tests/pan527/delayed-body-native.test.mjs",
    "tests/pan527/helpers.mjs",
    "tests/pan527/local-compatibility.test.mjs",
    "tests/pan527/native-https-ingress.test.mjs",
    "tests/pan527/origin-session.test.mjs",
    "tests/pan527/redirect-native.test.mjs",
    "tests/pan527/registration.test.mjs",
    "tests/pan527/test-runner.test.mjs",
    "tests/pan527/websocket-native.test.mjs",
    "docs/architecture/pan527-origin-session-development-v1.md",
    "docs/architecture/pan527-origin-session-development-v2.md",
    "docs/architecture/pan527-origin-session-development-v3.md",
    "docs/architecture/pan527-hosted-origin-session-v1.md",
    "verification/pan527-origin-session-evidence-v1.json",
    # PAN521 bounded connected native stage: source only, no financial or default runtime activation.
    "src/pan519/finance-handoff.mjs",
    "src/pan519/contract-transport.mjs",
    "src/pan521/connected-trade.mjs",
    "src/pan521/local-journey.mjs",
    "scripts/run-pan521-connected-trade.mjs",
    "scripts/run-pan521-connected-native-tests.mjs",
    "tests/pan519/native-fixture.mjs",
    "tests/pan519/native-finance.test.mjs",
    "tests/pan519/contract-transport.test.mjs",
    "tests/pan519/finance-negatives.test.mjs",
    "tests/pan521/connected-native-entry.test.mjs",
    "tests/pan521/local-journey.test.mjs",
    "tests/pan521/registration.test.mjs",
    "tests/pan521/test-runner.test.mjs",
    "docs/architecture/pan521-connected-native-stage-v1.md",
    "verification/pan521-local-connected-native-stage-v1.json",
    # PAN522 deterministic pure material planning: source only, no dispatch/capacity promotion.
    "src/pan522/material-plan.mjs",
    "src/pan522/plan-input.mjs",
    "scripts/run-pan522-material-plan.mjs",
    "scripts/run-pan522-material-tests.mjs",
    "tests/fixtures/pan522/pan-material-reference-v1.json",
    "tests/pan522/material-plan.test.mjs",
    "tests/pan522/material-plan-negatives.test.mjs",
    "tests/pan522/material-plan-cli.test.mjs",
    "tests/pan522/material-plan-native-no-effects.test.mjs",
    "tests/pan522/registration.test.mjs",
    "tests/pan522/test-runner.test.mjs",
    "docs/architecture/pan522-material-plan-v1.md",
    "verification/pan522-material-plan-v1.json",
    # PAN528 optional native browser journey: source only, no legacy payload activation.
    "src/pan528/app.js",
    "src/pan528/guided-browser.mjs",
    "src/pan528/guided-helper-broker.mjs",
    "src/pan528/native-journey-controller.mjs",
    "src/pan528/owned-leading-resources.mjs",
    "src/pan528/runtime-observation.mjs",
    "src/pan528/screen.html",
    "src/pan528/starter-worker.mjs",
    "src/pan528/style.css",
    "tests/pan528/browser-denials.test.mjs",
    "tests/pan528/browser-fixture.mjs",
    "tests/pan528/guided-abort-browser.test.mjs",
    "tests/pan528/guided-abort-native.test.mjs",
    "tests/pan528/guided-browser-native.test.mjs",
    "tests/pan528/guided-helper-boundary.test.mjs",
    "tests/pan528/guided-helper-browser.test.mjs",
    "tests/pan528/guided-reset-browser.test.mjs",
    "tests/pan528/guided-reset-native.test.mjs",
    "tests/pan528/mobile-browser.test.mjs",
    "tests/pan528/native-business-starter.test.mjs",
    "tests/pan528/native-process-restart.test.mjs",
    "tests/pan528/native-restart-process.mjs",
    "tests/pan528/owned-cleanup-boundary.test.mjs",
    "tests/pan528/owner-json-special-files.test.mjs",
    "tests/pan528/registration.test.mjs",
    "tests/pan528/test-runner.test.mjs",
    "tests/pan528/wrong-business-value-browser.test.mjs",
    "scripts/run-pan528-guided-browser-tests.mjs",
    "docs/architecture/pan528-guided-browser-v1.md",
    "verification/pan528-guided-browser-boundary-v1.json",
    # PAN523 bounded native production: source only, no physical/fiscal/financial authority.
    "src/pan523/production-state.mjs",
    "scripts/run-pan523-production.mjs",
    "scripts/run-pan523-production-tests.mjs",
    "tests/fixtures/pan523/native-production-fixture.mjs",
    "tests/fixtures/pan523/produced-dispatch-fixture.mjs",
    "tests/fixtures/pan523/historical-native-pins.mjs",
    "tests/fixtures/pan523/retained-pan515-trade-state-54d4a597.txt",
    "tests/pan523/native-production-boundaries.test.mjs",
    "tests/pan523/native-production-cli.test.mjs",
    "tests/pan523/native-production-cost.test.mjs",
    "tests/pan523/native-production-fulfilment.test.mjs",
    "tests/pan523/native-production-history.test.mjs",
    "tests/pan523/native-production-invoice.test.mjs",
    "tests/pan523/native-production-negatives.test.mjs",
    "tests/pan523/native-production-revision.test.mjs",
    "tests/pan523/native-production-rollback.test.mjs",
    "tests/pan523/native-production.test.mjs",
    "tests/pan523/historical-native-pins.test.mjs",
    "tests/pan523/registration.test.mjs",
    "tests/pan523/test-runner.test.mjs",
    "docs/architecture/pan523-native-production-v1.md",
    "verification/pan523-native-production-v1.json",
    "verification/pan523-historical-native-source-admission-v1.json",
    "tests/pan537/native-browser-fixture.mjs",
    "tests/pan537/browser-proposal-diff.test.mjs",
    "tests/pan537/registration.test.mjs",
    "tests/pan537/test-runner.test.mjs",
    "scripts/run-pan537-proposal-diff-browser-tests.mjs",
    "docs/architecture/pan537-proposal-diff-browser-v1.md",
    "tests/pan538/setup-overflow.test.mjs",
    # PAN541 optional shared shell is source-only; unchanged legacy runnable payload.
    "docs/architecture/browser-shell-plugin-v1.md",
    "packages/browser-shell/src/context-owner-v1.ts",
    "packages/browser-shell/src/deep-link-v1.ts",
    "packages/browser-shell/src/registry-v1.ts",
    "packages/browser-workspace/src/api-v1.ts",
    "packages/browser-workspace/src/app.ts",
    "packages/browser-workspace/src/plugin-diagnostics-v1.ts",
    "packages/browser-workspace/src/plugin-erv-v1.ts",
    "packages/browser-workspace/src/plugin-setup-v1.ts",
    "packages/browser-workspace/src/workspace.css",
    "packages/browser-workspace/src/workspace.html",
    "packages/contracts/src/browser-erv-read-v1.ts",
    "packages/contracts/src/browser-shell-plugin-v1.ts",
    "scripts/build-pan541-browser.mjs",
    "scripts/run-pan541-shared-browser-shell-tests.mjs",
    "src/pan541/native-erv-read-adapter.mjs",
    "src/pan541/workspace-browser.mjs",
    "tests/pan541/browser-context-safety.test.mjs",
    "tests/pan541/browser-plugin-fault.test.mjs",
    "tests/pan541/browser-workspace.test.mjs",
    "tests/pan541/context-native.test.mjs",
    "tests/pan541/deep-link.test.mjs",
    "tests/pan541/descriptor-types.ts",
    "tests/pan541/descriptor.test.mjs",
    "tests/pan541/native-erv-read.test.mjs",
    "tests/pan541/registration.test.mjs",
    "tests/pan541/registry.test.mjs",
    "tests/pan541/test-runner.test.mjs",
    "tests/pan541/workspace-native.test.mjs",
    # PAN543 optional personal presentation: source evidence only. The existing
    # legacy runnable payload/manifest is intentionally not widened.
    "docs/architecture/browser-profile-v1.md",
    "packages/browser-workspace/src/profile-editor-v1.ts",
    "packages/contracts/src/browser-profile-v1.ts",
    "scripts/run-pan543-browser-profile-tests.mjs",
    "scripts/refresh-pan543-integrity.mjs",
    "src/pan543/profile-store.mjs",
    "tests/pan543/backend-fixture.mjs",
    "tests/pan543/browser.test.mjs",
    "tests/pan543/profile-types.ts",
    "tests/pan543/profile.test.mjs",
    "tests/pan543/registration.test.mjs",
    "tests/pan543/transport.test.mjs",
    # PAN563 bounded configuration draft: source evidence only, not legacy runnable payload.
    "docs/architecture/agent-configuration-draft-v1.md",
    "packages/browser-workspace/src/configuration-draft-v1.css",
    "packages/browser-workspace/src/plugin-configuration-draft-v1.ts",
    "packages/contracts/src/agent-configuration-draft-v1.ts",
    "scripts/run-pan563-configuration-draft-tests.mjs",
    "src/pan563/draft-store.mjs",
    "tests/pan563/browser-draft.test.mjs",
    "tests/pan563/capture-coverage.mjs",
    "tests/pan563/compatibility.test.mjs",
    "tests/pan563/configuration-contract.test.mjs",
    "tests/pan563/contract-types.ts",
    "tests/pan563/durable-draft.test.mjs",
    "tests/pan563/helpers.mjs",
    "tests/pan563/native-view-capture.mjs",
    "tests/pan563/process-cas.test.mjs",
    "tests/pan563/process-drain-parent.mjs",
    "tests/pan563/process-drain-tail.mjs",
    "tests/pan563/process-observation.mjs",
    "tests/pan563/process-writer.mjs",
    "tests/pan563/protected-draft.test.mjs",
    "tests/pan563/registration.test.mjs",
    "tests/pan563/zoom-extension/manifest.json",
    "tests/pan563/zoom-extension/worker.js",

    # PAN542 bounded native human backend: source-only, no legacy payload/rights change.
    "docs/architecture/erv-human-native-backend-v1.md",
    "scripts/run-pan542-native-human-tests.mjs",
    "src/pan542/native-human-backend.mjs",
    "tests/pan542/native-human-backend.test.mjs",
    "tests/pan542/registration.test.mjs",
    "tests/pan542/restart-reader.mjs",

    # PAN544 personal native feed: source-only; legacy payload and rights unchanged.
    "docs/architecture/native-workspace-notifications-v1.md",
    "packages/browser-workspace/src/notifications-v1.ts",
    "packages/contracts/src/workspace-notifications-v1.ts",
    "scripts/run-pan544-native-notification-tests.mjs",
    "src/pan544/native-notifications.mjs",
    "tests/pan544/browser-fixture.mjs",
    "tests/pan544/browser-notifications.test.mjs",
    "tests/pan544/contracts.test.mjs",
    "tests/pan544/gateway.test.mjs",
    "tests/pan544/native-notifications.test.mjs",
    "tests/pan544/registration.test.mjs",
    "tests/pan544/restart-reader.mjs",

    # PAN549 bounded read-only result view: source-only; no legacy payload expansion.
    "contracts/workspace-analysis/pan549-early-candidate-v1.json",
    "docs/architecture/pan549-workspace-analysis-v1.md",
    "packages/browser-workspace/src/analysis-v1.css",
    "packages/browser-workspace/src/plugin-analysis-v1.ts",
    "packages/contracts/src/workspace-analysis-v1.ts",
    "scripts/run-pan549-native-analysis-tests.mjs",
    "src/pan549/native-analysis-read.mjs",
    "tests/pan549/browser-analysis.test.mjs",
    "tests/pan549/browser-fixture.mjs",
    "tests/pan549/browser-lifecycle-analysis.test.mjs",
    "tests/pan549/cohort-analysis.test.mjs",
    "tests/pan549/native-analysis-read.test.mjs",
    "tests/pan549/protected-analysis.test.mjs",
    "tests/pan549/registration.test.mjs",

    # PAN548 early authentic native context: exact source-only members, no broad
    # prefix, runnable manifest expansion, second shell or execution authority.
    "docs/architecture/workspace-context-selection-v1.md",
    "packages/browser-shell/src/extended-context-owner-v1.ts",
    "packages/browser-workspace/src/context-selection-v1.ts",
    "packages/contracts/src/workspace-context-selection-v1.ts",
    "scripts/run-pan548-authentic-context-tests.mjs",
    "src/pan548/native-context-selection.mjs",
    "tests/pan548/context-contract.test.mjs",
    "tests/pan548/native-context.test.mjs",
    "tests/pan548/native-expiry.test.mjs",
    "tests/pan548/native-reentrant.test.mjs",
    "tests/pan548/browser-context.test.mjs",
    "tests/pan548/registration.test.mjs",
    # Bounded current native task panel: no runnable manifest or real provider.
    "docs/architecture/workspace-agent-panel-v1.md",
    "packages/browser-workspace/src/workspace-agent-panel-v1.css",
    "packages/browser-workspace/src/workspace-agent-panel-v1.ts",
    "packages/contracts/src/workspace-agent-run-v1.ts",
    "src/pan548/native-agent-run.mjs",
    "tests/pan548/native-agent-run.test.mjs",
    "tests/pan548/agent-run-transport-contract.test.mjs",
    "tests/pan548/browser-agent-panel.test.mjs",

    # PAN546 additive personal views and connected native Human browser: exact
    # source-only members; existing runnable manifest and ingress bound unchanged.
    "docs/architecture/native-module-view-human-browser-v1.md",
    "packages/contracts/src/workspace-module-view-v1.ts",
    "packages/contracts/src/workspace-erv-human-v1.ts",
    "packages/browser-workspace/src/module-view-native-v1.ts",
    "packages/browser-workspace/src/module-view-editor-v1.ts",
    "packages/browser-workspace/src/module-view-v1.css",
    "packages/browser-workspace/src/erv-human-v1.ts",
    "src/pan546/native-data-catalog.mjs",
    "src/pan546/native-view-owner.mjs",
    "src/pan546/native-human-workspace.mjs",
    "scripts/run-pan546-native-view-human-tests.mjs",
    "tests/pan546/module-view.test.mjs",
    "tests/pan546/native-view.test.mjs",
    "tests/pan546/transport.test.mjs",
    "tests/pan546/native-association.test.mjs",
    "tests/pan546/reservation-native.test.mjs",
    "tests/pan546/native-human-workspace.test.mjs",
    "tests/pan546/native-references.test.mjs",
    "tests/pan546/browser-view.test.mjs",
    "tests/pan546/browser-human.test.mjs",
    "tests/pan546/browser-human-combined.test.mjs",
    "tests/pan546/registration.test.mjs",
    "tests/pan546/native-fixture.mjs",
    "tests/pan546/browser-fixture.mjs",
    "tests/pan546/native-profile-reservation-probe.mjs",
    "tests/pan546/native-human-reservation-probe.mjs",

    # PAN468 module-contribution impact selection — repository-only
    # (corrects the impact/compare consumer classification and bounds the
    # historical path-scan work; delivered via the SOURCE_EVIDENCE_ONLY real
    # GitHub source archive, not the runnable product-increment file set).
    # Declared here so the fail-closed completeness gate classifies them; they
    # are NOT added to release/public-files.manifest.
    "tests/pan468/pan468-impact-selection.test.mjs",
    "docs/architecture/pan468-impact-selection-v1.md",
    "verification/pan468-impact-selection-boundary-v1.json",
    # PAN469 contribution views — repository-only
    # (one-family pilot of independent contribution records and a
    # deterministic generated shared view with a single integration owner;
    # delivered via the SOURCE_EVIDENCE_ONLY real GitHub source archive, not
    # the runnable product-increment file set). Declared here so the
    # fail-closed completeness gate classifies them; they are NOT added to
    # release/public-files.manifest.
    "src/pan469/contribution-views.mjs",
    "tests/pan469/pan469-contribution-views.test.mjs",
    "docs/architecture/pan469-contribution-views-v1.md",
    "verification/pan469-contribution-views-boundary-v1.json",
    # PAN461 local synthetic installation lifecycle inventory — source evidence only.
    "docs/architecture/pan461-lifecycle-inventory-v1.md",
    "schemas/contracts/pan461-lifecycle-inventory-v1.schema.json",
    "src/pan461/lifecycle-inventory.mjs",
    "tests/pan461/lifecycle-inventory.test.mjs",
    "verification/pan461-lifecycle-inventory-boundary-v1.json",
    "tests/fixtures/pan461/artifacts-v1.json",
    "tests/fixtures/pan461/declared-release-content-v1.json",
    "tests/fixtures/pan461/expected-facts-v1.json",
    "tests/fixtures/pan461/key-refs-v1.json",
    "tests/fixtures/pan461/observed-config-drift-v1.json",
    "tests/fixtures/pan461/observed-modified-v1.json",
    "tests/fixtures/pan461/observed-partial-v1.json",
    "tests/fixtures/pan461/observed-running-v1.json",
    "tests/fixtures/pan461/observed-sleeping-v1.json",
    "tests/fixtures/pan461/observed-stopped-v1.json",
    "tests/fixtures/pan461/observed-unknown-v1.json",
    "tests/fixtures/pan461/stores-v1.json",
    # PAN471 bounded read-only capability inventory — repository-only source evidence.
    "docs/architecture/pan471-capability-inventory-v1.md",
    "schemas/contracts/pan471-capability-inventory-v1.schema.json",
    "src/pan471/capability-inventory.mjs",
    "tests/fixtures/pan471/expected-capabilities-v1.json",
    "tests/pan471/capability-inventory.test.mjs",
    "verification/pan471-capability-inventory-boundary-v1.json",
    # PAN470 complete worker handoff + measurable finalization effort — repository-only
    # (handoff completeness + exact per-phase effort measurement over the released
    # development-worker entry points and the existing work-order/receipt surfaces, with
    # synthetic fixtures; delivered via the SOURCE_EVIDENCE_ONLY real GitHub source archive,
    # not the runnable product-increment file set). Declared here so the fail-closed
    # completeness gate classifies them; they are NOT added to release/public-files.manifest.
    "src/pan470/handoff-effort.mjs",
    "src/pan470/producer-handoff-v2.mjs",
    "tests/pan470/handoff-effort.test.mjs",
    "tests/pan470/producer-handoff-v2.test.mjs",
    "tests/fixtures/pan470/producer-evidence-v2.txt",
    "schemas/contracts/pan470-handoff-effort-v1.schema.json",
    "docs/architecture/pan470-handoff-effort.md",
    "verification/pan470-handoff-effort-boundary-v1.json",
    "tests/fixtures/pan470/evidence-selfcheck-v1.txt",
    # PAN465 promotes the bounded PAN463/PAN464 native source closure into the
    # ordinary allowlist. Generated Git bundles/dependencies/signatures/receipts
    # use the separate closed offline composer, never a global allowlist bypass.
    ".github/workflows/retained-native-pair.yml",
}
repository_only_prefixes = (
    "archive/cm-bi-legacy-v1/",
    "closure-audits/",
    "docs/development/cm-bi-ownership-migration-v2-prepared.md",
    "docs/DAILY-POC-",
    "docs/development/daily-poc-",
    "docs/development/evidence/",
    "docs/development/rel-daily-",
    "docs/evidence/conveyor/",
    "docs/evidence/",
    "examples/daily-poc/",
    "schemas/daily-poc-",
    "scripts/daily-poc.",
    "tests/daily-poc.",
    "tests/fixtures/daily-poc/",
    "verification/rks-01-run-receipts/",
    "verification/rks-02-run-receipts/",
    "tests/fixtures/cscl-03/source-snapshots/",
    "tests/fixtures/cscl-05/artifacts/",
    "tests/fixtures/cscl-05/sources/",
)
for candidate in root.rglob("*"):
    relative = candidate.relative_to(root).as_posix()
    if (
        relative == ".git"
        or relative.startswith(".git/")
        or relative.startswith("node_modules/")
        or relative.startswith("dist/")
        or relative.startswith(".verify-probes/")
        or "/__pycache__/" in f"/{relative}"
        or relative.endswith(".pyc")
    ):
        continue
    metadata = candidate.lstat()
    if stat.S_ISDIR(metadata.st_mode):
        continue
    if stat.S_ISLNK(metadata.st_mode):
        raise SystemExit(f"SOURCE_TREE_SYMLINK:{relative}")
    if not stat.S_ISREG(metadata.st_mode):
        raise SystemExit(f"SOURCE_TREE_SPECIAL_FILE:{relative}")
    if (
        relative not in expected
        and not relative.startswith("node_modules/")
        and not relative.startswith("dist/")
        and "/__pycache__/" not in f"/{relative}"
        and not relative.endswith(".pyc")
        and relative != "package-lock.before-version-reconcile.json"
        and relative not in repository_only_files
        and not relative.startswith(repository_only_prefixes)
        and not relative.startswith(".github/")
        and not relative.startswith(".chimpmaera-acceptance/")
        and not relative.startswith(".chimpmaera-demo/")
        and not relative.startswith(".chimpmaera-aas035/")
        and not relative.startswith(".chimpmaera-aas036/")
        and not relative.startswith(".chimpmaera-aas037/")
        and not relative.startswith(".chimpmaera-bld001/")
        and not relative.startswith("docs/development/")
    ):
        raise SystemExit(f"UNMANIFESTED_SOURCE_FILE:{relative}")

for relative in expected:
    candidate = root / relative
    suffix = candidate.suffix.lower()
    name = candidate.name.lower()
    if suffix not in text_suffixes and name not in {"dockerfile", "license", "notice"}:
        continue
    text = candidate.read_text("utf-8")
    for label, pattern in private_path_patterns.items():
        if pattern.search(text):
            raise SystemExit(f"PRIVATE_PATH_OR_SESSION:{label}:{relative}")
    for label, pattern in secret_patterns.items():
        if pattern.search(text):
            raise SystemExit(f"POTENTIAL_SECRET:{label}:{relative}")
    for label, pattern in content_quality_patterns.items():
        if pattern.search(text):
            raise SystemExit(f"CONTENT_QUALITY:{label}:{relative}")
PY

temporary="$output.partial.$$"
[[ ! -e "$temporary" && ! -L "$temporary" ]] || {
  printf 'Temporary output collision.\n' >&2
  exit 73
}
mkdir -m 0755 -- "$temporary"

cleanup_partial() {
  if [[ -d "$temporary" && ! -L "$temporary" ]]; then
    find -P "$temporary" -depth -delete || true
  fi
}
trap cleanup_partial EXIT

while IFS=$'\t' read -r source destination mode; do
  [[ -n "$source" && "$source" != \#* ]] || continue
  install -D -m "$mode" -- "$source_root/$source" "$temporary/$destination"
done < "$manifest"

python3 - "$temporary" "$manifest" <<'PY'
import pathlib
import stat
import sys

root = pathlib.Path(sys.argv[1])
manifest = pathlib.Path(sys.argv[2])
expected = {}
for raw in manifest.read_text("utf-8").splitlines():
    if not raw or raw.startswith("#"):
        continue
    _, destination, mode = raw.split("\t")
    expected[destination] = int(mode, 8)
actual = {}
for candidate in root.rglob("*"):
    relative = candidate.relative_to(root).as_posix()
    metadata = candidate.lstat()
    if stat.S_ISDIR(metadata.st_mode):
        continue
    if stat.S_ISLNK(metadata.st_mode):
        raise SystemExit(f"STAGING_SYMLINK:{relative}")
    if not stat.S_ISREG(metadata.st_mode):
        raise SystemExit(f"STAGING_SPECIAL_FILE:{relative}")
    actual[relative] = candidate
if set(actual) != set(expected):
    raise SystemExit("STAGING_MISSING_OR_EXTRA_FILE")
for relative, candidate in actual.items():
    if stat.S_IMODE(candidate.stat().st_mode) != expected[relative]:
        raise SystemExit(f"STAGING_MODE_MISMATCH:{relative}")
PY

find "$temporary" -exec touch -h -d '@0' -- {} +
(
  cd "$temporary"
  find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
)
chmod 0644 "$temporary/SHA256SUMS"
touch -d '@0' "$temporary/SHA256SUMS"

mv -- "$temporary" "$output"
trap - EXIT
printf 'cm-public-release-marker-v1\n' > "$marker"
chmod 0600 "$marker"

tar --sort=name \
  --mtime='@0' \
  --owner=0 \
  --group=0 \
  --numeric-owner \
  --format=posix \
  --pax-option=delete=atime,delete=ctime \
  -C "$output_parent" \
  -cf - "$output_name" \
  | gzip -n > "$archive"
chmod 0644 "$archive"

python3 - "$archive" "$output_name" <<'PY'
import pathlib
import tarfile
import sys
import unicodedata

archive = pathlib.Path(sys.argv[1])
prefix = sys.argv[2] + "/"
seen = set()
casefolded = set()
with tarfile.open(archive, "r:gz") as handle:
    for member in handle.getmembers():
        name = member.name
        if (
            not (name == sys.argv[2] or name.startswith(prefix))
            or name.startswith("/")
            or "\\" in name
            or name != unicodedata.normalize("NFC", name)
            or any(part in {"", ".", ".."} for part in name.split("/"))
        ):
            raise SystemExit(f"UNSAFE_ARCHIVE_PATH:{name}")
        if not (member.isfile() or member.isdir()):
            raise SystemExit(f"UNSAFE_ARCHIVE_TYPE:{name}")
        if member.mode & 0o6000:
            raise SystemExit(f"UNSAFE_ARCHIVE_MODE:{name}")
        if name in seen or name.casefold() in casefolded:
            raise SystemExit(f"ARCHIVE_PATH_COLLISION:{name}")
        seen.add(name)
        casefolded.add(name.casefold())
PY

printf 'STAGING=%s\n' "$output"
printf 'ARCHIVE=%s\n' "$archive"
printf 'ARCHIVE_SHA256=%s\n' "$(sha256sum "$archive" | awk '{print $1}')"
