# CI/CD of IDVS with Docker, Jenkins and Kubernetes

The repository has two automation layers that do the same quality work:

| Layer | File | Runs on | Purpose |
|---|---|---|---|
| GitHub Actions | `.github/workflows/ci.yml`, `codeql.yml`, `release.yml` | GitHub-hosted runners | public CI, security scan, release |
| **Jenkins** | `Jenkinsfile`, `ci/` | the developer machine or a university server | CI + CD with a local registry and a Kubernetes test cluster (Assignment 5) |

## Pipeline (`Jenkinsfile`)

```
commit -> Info -> Quality gates (parallel) ------------------------------+
                  |- Backend: ruff + pytest + coverage >= 80 %           |
                  '- Frontend: eslint + vitest (coverage gates) + build  |
          -> Build Docker image -> Smoke test of the container (/api/health, uid != 0)
          -> Push to registry (localhost:5000) -> [optional] Docker Hub
          -> Deploy to Kubernetes (kind) + in-cluster health check
```

* **Trigger:** the job polls the repository every minute (`pollSCM`); every new commit starts a build.
* **Tests run inside Docker** (`ci/Dockerfile.test`, targets `backend-test` and `frontend-test`). Each tool
  stores its exit code in `/reports/*.rc`; Jenkins copies `/reports` out, publishes the JUnit files and only
  then fails the stage. A red build therefore still has its test report.
* **Image:** `Dockerfile` is a multi-stage build (React build -> slim Python runtime), runs as the non-root
  user `10001`, has a `HEALTHCHECK` and OCI labels (including the git commit).
* **Registry:** `registry:2` on `localhost:5000`. Docker Hub is a parameter (`PUSH_DOCKERHUB`) and needs a
  Jenkins credential with id `dockerhub`.
* **CD:** the image is loaded into the `idvs-test` kind cluster, `k8s/idvs.yaml` is applied, and the stage
  waits for the rollout and calls `/api/health` inside the pod. The UI is then available on
  <http://localhost:18080> (NodePort 30080).

## Run it locally

```bash
# 1. Jenkins + registry (Docker Desktop must be running)
docker compose -f ci/docker-compose.yml up -d --build
# 2. Kubernetes test cluster and access for Jenkins (needs kind and kubectl)
bash ci/scripts/kind-up.sh
# 3. open http://localhost:8088  ->  job "idvs-pipeline"  (created from ci/jenkins/casc.yaml)
```

Jenkins is configured as code (`ci/jenkins/casc.yaml`, plugins in `ci/jenkins/plugins.txt`), so the server can
be rebuilt from this folder at any time. Access control is off because the port is bound to `127.0.0.1`;
a shared server needs a security realm and credentials.

## Security notes

* Jenkins gets the host Docker socket, which is root-equivalent access to the host. This is acceptable for a
  local demo; on a shared server use rootless agents or a build service.
* The production image does not run as root. Bind-mounted data directories must be writable by uid `10001`.
* Secrets (Docker Hub password) are only read through Jenkins credentials, never stored in the repository.

## Measured results of the first runs

Jenkins 2.580.1, Docker Desktop 28.3.3, kind v0.27.0 (Kubernetes 1.32.2). Back end: 167 tests, coverage 90 %;
front end: 68 tests; image `idvs` 669 MB.

| Build | Trigger | Result | Duration | What happened |
|---|---|---|---|---|
| 1 | commit (polling) | stopped | 7 min 20 s | `git fetch` stalled on a dead connection; aborted and restarted |
| 2 | manual | failed | 15 s | the static `docker` CLI had no buildx plugin: `BuildKit is enabled but the buildx component is missing` |
| 3 | manual | success | 6 min 11 s | first green build, all stages, deployed to the kind cluster |
| 4 | commit (polling) | success | 24 min 32 s | started by a push without any click; the commit hash passed as a build argument invalidated the pip layer, which was slow to rebuild on a weak connection |
| 5 | commit (polling) | success | 4 min 4 s | build argument moved after the slow layers; second deployment is a rolling update |

Builds started by a push show "Started by an SCM change" in the Jenkins log.
