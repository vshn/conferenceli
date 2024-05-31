import logging
import os
import random
from kubernetes import client, config as k8sconfig, watch
from flask import Flask, render_template, Response, jsonify
from flask_bootstrap import Bootstrap5
from threading import Thread, Event

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

stop_event = Event()

@app.route("/")
def index():
    return render_template("index.html")

def watch_pods():
    w = watch.Watch()
    for event in w.stream(v1.list_namespaced_pod, namespace, timeout_seconds=0):
        if stop_event.is_set():
            break
        pod = event['object']
        pod_status = {
            "name": pod.metadata.name,
            "status": pod.status.phase,
            "index": pod.metadata.labels.get("statefulset.kubernetes.io/pod-name", "unknown"),
        }
        yield f'data: {pod_status}\n\n'

@app.route("/chaos")
def chaos():
    pods = v1.list_namespaced_pod(namespace).items
    if pods:
        pod = random.choice(pods)
        pod_name = pod.metadata.name
        v1.delete_namespaced_pod(pod_name, namespace)
        return jsonify({"message": f"Pod {pod_name} deleted"}), 200
    else:
        return jsonify({"message": "No pods available to delete"}), 404

@app.route("/stream")
def stream():
    return Response(watch_pods(), content_type='text/event-stream')

@app.route("/shutdown", methods=['POST'])
def shutdown():
    stop_event.set()
    return 'Shutting down...'

if __name__ == "__main__":
    flask_debug = True if config.LOG_LEVEL == "DEBUG" else False
    try:
        app.run(debug=flask_debug)
    except ConfigError as e:
        logging.error(e)
