# Jenkins controller for the IDVS pipeline (local demo).
# Adds the tools the Jenkinsfile calls: docker CLI (talks to the host daemon through the socket),
# kubectl and kind (continuous delivery to a local Kubernetes cluster), plus the plugins from
# plugins.txt. Jobs and settings come from casc.yaml (Jenkins Configuration as Code), so the whole
# server is reproducible from this folder.
FROM jenkins/jenkins:lts-jdk21

USER root
ARG DOCKER_VERSION=28.3.3
ARG KUBECTL_VERSION=v1.32.2
ARG KIND_VERSION=v0.27.0
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL "https://download.docker.com/linux/static/stable/x86_64/docker-${DOCKER_VERSION}.tgz" \
       | tar -xz --strip-components=1 -C /usr/local/bin docker/docker \
    && curl -fsSLo /usr/local/bin/kubectl "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" \
    && curl -fsSLo /usr/local/bin/kind "https://kind.sigs.k8s.io/dl/${KIND_VERSION}/kind-linux-amd64" \
    && chmod +x /usr/local/bin/kubectl /usr/local/bin/kind

COPY plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt

COPY casc.yaml /casc/casc.yaml
ENV CASC_JENKINS_CONFIG=/casc/casc.yaml \
    JAVA_OPTS="-Djenkins.install.runSetupWizard=false -Dhudson.model.ParametersAction.keepUndefinedParameters=true"
