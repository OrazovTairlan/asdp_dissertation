#!/usr/bin/env bash
# Creates the Kubernetes cluster used by the CD stage and gives the Jenkins container access to it.
# Usage (repository root, after "docker compose -f ci/docker-compose.yml up -d"):  bash ci/scripts/kind-up.sh
set -euo pipefail

CLUSTER="${1:-idvs-test}"

if kind get clusters | grep -qx "${CLUSTER}"; then
  echo "kind cluster ${CLUSTER} already exists"
else
  kind create cluster --name "${CLUSTER}" --config ci/kind-config.yaml
fi

# Jenkins must reach the API server: join the "kind" network and use the internal kubeconfig
docker network connect kind idvs-jenkins 2>/dev/null || true
docker exec idvs-jenkins sh -c "mkdir -p /var/jenkins_home/.kube \
  && kind get kubeconfig --name ${CLUSTER} --internal > /var/jenkins_home/.kube/config"
docker exec idvs-jenkins kubectl --kubeconfig /var/jenkins_home/.kube/config get nodes
