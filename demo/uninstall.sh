#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -gt 1 ]; then
  printf 'Only no option, --purge, --help or -h is accepted.\n' >&2
  exit 2
fi
if [ "$#" -eq 1 ]; then
  case "$1" in
    --purge|--help|-h) ;;
    *) printf 'Only no option, --purge, --help or -h is accepted.\n' >&2; exit 2 ;;
  esac
fi
if [ "$#" -eq 1 ] && { [ "$1" = --help ] || [ "$1" = -h ]; }; then
  printf 'Usage: demo/uninstall.sh [--purge | --help | -h]\n'
  printf 'Without an option: stop the owned installation and retain its data.\n'
  printf 'With --purge: remove only the verified owned installation resources.\n'
  exit 0
fi
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
state="$root/.chimpmaera-demo"
config="$state/config.env"
if [ -L "$state" ] || [ -L "$config" ] || [ -L "$state/secrets" ]; then
  printf 'Refusing teardown from linked installation state or configuration.\n' >&2
  exit 2
fi
[ -f "$config" ] || { printf 'No owned installation exists.\n'; exit 0; }
project="$(sed -n 's/^COMPOSE_PROJECT_NAME=//p' "$config")"
[[ "$project" =~ ^[a-z0-9][a-z0-9_-]{0,47}$ ]] || {
  printf 'Refusing teardown without one valid configured Compose project.\n' >&2
  exit 2
}
if [ "${1:-}" = --purge ]; then
  run_owner="$(sed -n 's/^CM_DEMO_RUN_OWNER=//p' "$config")"
  [[ "$run_owner" =~ ^pansphaira-e2e-[0-9]+-[0-9]+$ ]] && [ "$run_owner" = "$project" ] || {
    printf 'Refusing to purge without exact configured run/project ownership.\n' >&2
    exit 2
  }
  image_ref="$(sed -n 's/^CM_CHIMP_IMAGE=//p' "$config")"
  image_id=''
  if [ -n "$image_ref" ]; then
    image_id="$(docker image inspect "$image_ref" --format '{{.Id}}' 2>/dev/null || true)"
  fi
  [ -n "$image_id" ] || {
    printf 'Refusing to purge without an observed runtime image binding.\n' >&2
    exit 2
  }
  owner="$(
    docker image inspect "$image_id" \
      --format '{{index .Config.Labels "io.chimpmaera.demo.owner"}}'
  )"
  [ "$owner" = chimpmaera-v01-playable-installer ] || {
    printf >&2 'Refusing to remove runtime image without the installer ownership label.\n'
    exit 2
  }
  observed_run_owner="$(
    docker image inspect "$image_id" \
      --format '{{index .Config.Labels "io.chimpmaera.demo.run-owner"}}'
  )"
  [ "$observed_run_owner" = "$run_owner" ] || {
    printf >&2 'Refusing to remove runtime image without exact run ownership.\n'
    exit 2
  }
  all_volumes="$(docker volume ls --format '{{.Name}}')" || {
    printf 'Refusing to purge without observed volume inventory.\n' >&2
    exit 2
  }
  for volume_key in chimpmaera_state espo_db_data espo_data doli_db_data doli_documents; do
    volume_name="${project}_${volume_key}"
    if grep -Fxq -- "$volume_name" <<< "$all_volumes"; then
      volume_project="$(docker volume inspect "$volume_name" --format '{{index .Labels "com.docker.compose.project"}}')"
      [ "$volume_project" = "$project" ] || {
        printf 'Refusing to purge a declared volume without exact project ownership.\n' >&2
        exit 2
      }
    fi
  done
fi
down_args=(down --remove-orphans)
if [ "${1:-}" = --purge ]; then
  down_args+=(--volumes)
fi
docker compose --project-name "$project" --env-file "$config" -f "$root/demo/compose.yaml" "${down_args[@]}"
if [ "${1:-}" = --purge ]; then
  if [ -n "$image_id" ]; then
    tag_id="$(
      docker image inspect chimpmaera/v01-runtime:local \
        --format '{{.Id}}' 2>/dev/null || true
    )"
    if [ "$tag_id" = "$image_id" ]; then
      docker image rm chimpmaera/v01-runtime:local >/dev/null
    fi
    if docker image inspect "$image_ref" >/dev/null 2>&1; then
      docker image rm "$image_ref" >/dev/null
    fi
    if docker image inspect "$image_id" >/dev/null 2>&1; then
      docker image rm "$image_id" >/dev/null
    fi
  fi
  find "$state/secrets" -type f -exec shred -u {} + 2>/dev/null || true
  rm -rf -- "$state"
fi
printf 'Owned PanSphaira demo resources removed%s.\n' "$([ "${1:-}" = --purge ] && printf ' including state' || true)"
