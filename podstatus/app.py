import logging
import os
import sys
import random
import time
from kubernetes import client, config as k8sconfig, watch
from kubernetes.config import ConfigException
from flask import Flask, render_template, Response, jsonify
from flask_bootstrap import Bootstrap5
from threading import Thread, Event
from blinkstick import blinkstick
from usb.core import NoBackendError, USBError

from config import *

app = Flask(__name__)
app.secret_key = config.FLASK_APP_SECRET_KEY
bootstrap = Bootstrap5(app)

# Basic styling
app.config["BOOTSTRAP_BOOTSWATCH_THEME"] = "solar"
app.config["BOOTSTRAP_SERVE_LOCAL"] = True

# Load kubeconfig or use in-cluster configuration
kubeconfig_path = config.KUBECONFIG
try:
    if kubeconfig_path:
        logging.info(f"Loading kubeconfig from {kubeconfig_path}")
        k8sconfig.load_kube_config(config_file=kubeconfig_path)
    else:
        logging.info(f"Loading in-cluster kubeconfig")
        k8sconfig.load_incluster_config()

    v1 = client.CoreV1Api()
    namespace = config.K8S_NAMESPACE
except ConfigException as e:
    logging.fatal(e)
    sys.exit(4)

# Blinkstick setup
try:
    bstick = blinkstick.find_first()
    if not bstick:
        logging.info("No BlinkStick found")
    logging.info(
        f"BlinkStick found: {bstick.get_description()} - {bstick.get_serial()}"
    )
    logging.info(
        f"Setting total LED to {config.BLINKSTICK_TOTAL_LED} and grouping to {config.BLINKSTICK_GROUP_LED}"
    )
    bstick.set_led_count(config.BLINKSTICK_TOTAL_LED)
    led_per_pod = config.BLINKSTICK_GROUP_LED
except NoBackendError as e:
    logging.fatal(f"BlinkStick setup failed: {e}")
    bstick = None
except USBError as e:
    logging.fatal(f"BlinkStick setup failed: {e}")
    bstick = None

# Threading setup
stop_event = Event()


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

        if bstick:
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
        try:
            v1.delete_namespaced_pod(pod_name, namespace)
            logging.info(f"Chaos monkey deleted pod {pod_name}")
        except ApiException as e:
            logging.error(f"Chaos monkey couldn't delete pod {pod_name} because {e}")
            return jsonify({"message": f"Deleting of {pod_name} failed"}), 500
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
