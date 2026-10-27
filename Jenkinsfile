// CI/CD pipeline of IDVS (Intelligent Document Verification System), Assignment 5.
//
//   commit -> quality gates in containers (backend + frontend, in parallel)
//          -> docker image -> smoke test of the running container
//          -> push to a registry -> (CD) rollout to a Kubernetes cluster + health check
//
// Jenkins itself runs from ci/docker-compose.yml; see docs/CICD.md. Tests run inside Docker
// (ci/Dockerfile.test), so the Jenkins machine needs no Python or Node.

pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        timeout(time: 45, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '15'))
    }

    // poll the repository every minute: every new commit starts a build
    triggers {
        pollSCM('* * * * *')
    }

    parameters {
        booleanParam(name: 'DEPLOY_K8S', defaultValue: true,
                     description: 'Continuous delivery: roll the new image out to the kind cluster')
        booleanParam(name: 'PUSH_DOCKERHUB', defaultValue: false,
                     description: 'Also push to Docker Hub (needs a Jenkins credential with id "dockerhub")')
        string(name: 'DOCKERHUB_REPO', defaultValue: 'orazovtairlan/idvs',
               description: 'Docker Hub repository used when PUSH_DOCKERHUB is ticked')
    }

    environment {
        IMAGE         = 'idvs'
        TAG           = "${env.BUILD_NUMBER}"
        LOCAL_REG     = 'localhost:5000'
        KIND_CLUSTER  = 'idvs-test'
        KUBECONFIG    = '/var/jenkins_home/.kube/config'
        DOCKER_BUILDKIT = '1'
    }

    stages {
        stage('Info') {
            steps {
                sh '''
                    echo "Commit:   $(git log -1 --format='%h %s')"
                    echo "Branch:   ${GIT_BRANCH:-unknown}"
                    echo "Docker:   $(docker version --format '{{.Server.Version}}')"
                    echo "kubectl:  $(kubectl version --client | head -1)"
                '''
            }
        }

        stage('Quality gates') {
            parallel {
                stage('Backend: ruff + pytest') {
                    steps {
                        sh '''
                            docker build -f ci/Dockerfile.test --target backend-test \
                                -t ${IMAGE}-backend-test:${TAG} .
                            rm -rf reports/backend && mkdir -p reports/backend
                            cid=$(docker create ${IMAGE}-backend-test:${TAG})
                            docker cp "$cid:/reports/." reports/backend
                            docker rm "$cid" > /dev/null
                            fail=0
                            for tool in ruff format pytest; do
                                rc=$(cat reports/backend/$tool.rc)
                                echo "$tool exit code: $rc"
                                [ "$rc" = "0" ] || fail=1
                            done
                            exit $fail
                        '''
                    }
                    post {
                        always {
                            junit allowEmptyResults: true, testResults: 'reports/backend/backend-junit.xml'
                            archiveArtifacts artifacts: 'reports/backend/*', allowEmptyArchive: true
                        }
                    }
                }
                stage('Frontend: eslint + vitest + build') {
                    steps {
                        sh '''
                            docker build -f ci/Dockerfile.test --target frontend-test \
                                -t ${IMAGE}-frontend-test:${TAG} .
                            rm -rf reports/frontend && mkdir -p reports/frontend
                            cid=$(docker create ${IMAGE}-frontend-test:${TAG})
                            docker cp "$cid:/reports/." reports/frontend
                            docker rm "$cid" > /dev/null
                            fail=0
                            for tool in lint vitest build; do
                                rc=$(cat reports/frontend/$tool.rc)
                                echo "$tool exit code: $rc"
                                [ "$rc" = "0" ] || fail=1
                            done
                            exit $fail
                        '''
                    }
                    post {
                        always {
                            junit allowEmptyResults: true, testResults: 'reports/frontend/frontend-junit.xml'
                            archiveArtifacts artifacts: 'reports/frontend/*', allowEmptyArchive: true
                        }
                    }
                }
            }
        }

        stage('Build Docker image') {
            steps {
                sh '''
                    docker build --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) \
                        -t ${IMAGE}:${TAG} -t ${IMAGE}:latest .
                    docker image ls ${IMAGE}
                '''
            }
        }

        stage('Smoke test of the container') {
            steps {
                sh '''
                    docker rm -f idvs-smoke > /dev/null 2>&1 || true
                    docker run -d --name idvs-smoke ${IMAGE}:${TAG}
                    ok=0
                    for i in $(seq 1 30); do
                        if docker exec idvs-smoke python -c "import urllib.request as u; r = u.urlopen('http://localhost:8000/api/health', timeout=3); print('GET /api/health ->', r.status); raise SystemExit(0 if r.status == 200 else 1)"; then
                            ok=1; break
                        fi
                        sleep 2
                    done
                    if [ "$ok" != "1" ]; then docker logs idvs-smoke; exit 1; fi
                    echo "container runs as uid $(docker exec idvs-smoke id -u) (not root)"
                '''
            }
            post {
                always {
                    sh 'docker rm -f idvs-smoke > /dev/null 2>&1 || true'
                }
            }
        }

        stage('Push to registry') {
            steps {
                sh '''
                    docker tag ${IMAGE}:${TAG} ${LOCAL_REG}/${IMAGE}:${TAG}
                    docker tag ${IMAGE}:${TAG} ${LOCAL_REG}/${IMAGE}:latest
                    docker push ${LOCAL_REG}/${IMAGE}:${TAG}
                    docker push ${LOCAL_REG}/${IMAGE}:latest
                    echo "tags in the registry:"
                    curl -s http://registry:5000/v2/${IMAGE}/tags/list
                    echo
                '''
            }
        }

        stage('Push to Docker Hub (optional)') {
            when { expression { params.PUSH_DOCKERHUB } }
            steps {
                withCredentials([usernamePassword(credentialsId: 'dockerhub',
                                                  usernameVariable: 'DH_USER', passwordVariable: 'DH_PASS')]) {
                    sh '''
                        echo "$DH_PASS" | docker login -u "$DH_USER" --password-stdin
                        docker tag ${IMAGE}:${TAG} ${DOCKERHUB_REPO}:${TAG}
                        docker tag ${IMAGE}:${TAG} ${DOCKERHUB_REPO}:latest
                        docker push ${DOCKERHUB_REPO}:${TAG}
                        docker push ${DOCKERHUB_REPO}:latest
                        docker logout
                    '''
                }
            }
        }

        stage('Deploy to Kubernetes (CD)') {
            when { expression { params.DEPLOY_K8S } }
            steps {
                sh '''
                    kind load docker-image ${IMAGE}:${TAG} --name ${KIND_CLUSTER}
                    sed "s|IMAGE_PLACEHOLDER|${IMAGE}:${TAG}|" k8s/idvs.yaml | kubectl apply -f -
                    kubectl -n idvs rollout status deployment/idvs --timeout=240s
                    kubectl -n idvs get deployment,pods,svc -o wide
                    kubectl -n idvs exec deploy/idvs -- python -c "import urllib.request as u; r = u.urlopen('http://localhost:8000/api/health', timeout=4); print('in-cluster GET /api/health ->', r.status)"
                    echo "deployed ${IMAGE}:${TAG}; open http://localhost:18080"
                '''
            }
        }
    }

    post {
        success { echo "Build ${env.BUILD_NUMBER}: all stages passed, image ${env.IMAGE}:${env.TAG} is deployed." }
        failure { echo "Build ${env.BUILD_NUMBER} failed: see the stage that is red above." }
        // remove only this build's test images; no global prune, the Docker daemon is shared
        cleanup { sh 'docker rmi ${IMAGE}-backend-test:${TAG} ${IMAGE}-frontend-test:${TAG} > /dev/null 2>&1 || true' }
    }
}
