import logging
import os
from kubernetes import client, config as k8sconfig

from flask import Flask, render_template, jsonify
from flask_bootstrap import Bootstrap5

from config import *

app = Flask(__name__)
app.secret_key = config.FLASK_APP_SECRET_KEY
bootstrap = Bootstrap5(app)

# Basic styling
app.config["BOOTSTRAP_BOOTSWATCH_THEME"] = "sandstone"
app.config["BOOTSTRAP_SERVE_LOCAL"] = True

# Load kubeconfig or use in-cluster configuration
kubeconfig_path = config.KUBECONFIG
if kubeconfig_path:
    k8sconfig.load_kube_config(config_file=kubeconfig_path)
else:
    k8sconfig.load_incluster_config()

v1 = client.CoreV1Api()

namespace = config.K8S_NAMESPACE


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/pods")
def get_pods():
    pods = v1.list_namespaced_pod(namespace)
    pod_status = [
        {
            "name": pod.metadata.name,
            "status": pod.status.phase,
            "index": pod.metadata.labels.get(
                "statefulset.kubernetes.io/pod-name", "unknown"
            ),
        }
        for pod in pods.items
    ]
    return jsonify(pod_status)


if __name__ == "__main__":
    flask_debug = True if config.LOG_LEVEL == "DEBUG" else False
    try:
        app.run(debug=flask_debug)
    except ConfigError as e:
        logging.error(e)
