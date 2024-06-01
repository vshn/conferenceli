import logging
import os
import random
import time
from kubernetes import client, config as k8sconfig, watch
from flask import Flask, render_template, Response, jsonify
from flask_bootstrap import Bootstrap5
from threading import Thread, Event
from blinkstick import blinkstick

from config import *

app = Flask(__name__)
app.secret_key = config.FLASK_APP_SECRET_KEY
bootstrap = Bootstrap5(app)

# Basic styling
app.config["BOOTSTRAP_BOOTSWATCH_THEME"] = "solar"
app.config["BOOTSTRAP_SERVE_LOCAL"] = True

# Load kubeconfig or use in-cluster configuration
kubeconfig_path = config.KUBECONFIG
if kubeconfig_path:
    k8sconfig.load_kube_config(config_file=kubeconfig_path)
else:
    k8sconfig.load_incluster_config()

# Kubernetes setup
v1 = client.CoreV1Api()
namespace = config.K8S_NAMESPACE

# Threading setup
stop_event = Event()

# Blinkstick setup
bstick = blinkstick.find_first()
led_per_pod = 3


def set_led_color(pod_index, color):
    start_led = pod_index * led_per_pod
    for i in range(start_led, start_led + led_per_pod):
        bstick.set_color(channel=0, index=i, hex=color)
        time.sleep(0.1)


def watch_pods():
    w = watch.Watch()
    pod_index_map = {}
    for event in w.stream(v1.list_namespaced_pod, namespace, timeout_seconds=0):
        if stop_event.is_set():
            break
        pod = event["object"]
        pod_name = pod.metadata.name
        pod_status = pod.status.phase
        pod_index = pod.metadata.labels.get(
            "statefulset.kubernetes.io/pod-name", "unknown"
        )

        if pod_index not in pod_index_map:
            pod_index_map[pod_index] = len(pod_index_map)

        color = (
            "#008000"
            if pod_status == "Running"
            else "#ffff00" if pod_status == "Pending" else "#ff0000"
        )
        set_led_color(pod_index_map[pod_index], color)

        yield f'data: {{"name": "{pod_name}", "status": "{pod_status}", "index": "{pod_index}"}}\n\n'


### Routes


@app.route("/")
def index():
    return render_template("index.html")


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
    return Response(watch_pods(), content_type="text/event-stream")


@app.route("/shutdown", methods=["POST"])
def shutdown():
    stop_event.set()
    return "Shutting down..."


if __name__ == "__main__":
    flask_debug = True if config.LOG_LEVEL == "DEBUG" else False
    try:
        app.run(debug=flask_debug)
    except ConfigError as e:
        logging.error(e)