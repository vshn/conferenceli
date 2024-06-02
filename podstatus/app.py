import logging
import time
import random
import atexit
from threading import Thread, Event
from kubernetes import client, config as k8sconfig, watch
from kubernetes.config import ConfigException
from flask import Flask, render_template, Response, jsonify
from flask_bootstrap import Bootstrap5
from blinkstick import blinkstick
from usb.core import NoBackendError, USBError

from config import *

# Initialize the Flask app
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
        logging.info("Loading in-cluster kubeconfig")
        k8sconfig.load_incluster_config()

    v1 = client.CoreV1Api()
    namespace = config.K8S_NAMESPACE
    if not namespace:
        raise ValueError("K8S_NAMESPACE is not defined in the config.")
except (ConfigException, ValueError) as e:
    logging.fatal(e)
    sys.exit(4)

# Blinkstick setup
try:
    bstick = blinkstick.find_first()
    if not bstick:
        logging.info("No BlinkStick found")
    else:
        logging.info(
            f"BlinkStick found: {bstick.get_description()} - {bstick.get_serial()}"
        )
        bstick.set_led_count(config.BLINKSTICK_TOTAL_LED)
        led_per_pod = config.BLINKSTICK_GROUP_LED
except (NoBackendError, USBError) as e:
    logging.fatal(f"BlinkStick setup failed: {e}")
    bstick = None


# Ensure Blinkstick is turned off on exit
def turn_off_blinkstick():
    if bstick:
        logging.info("Turning off BlinkStick")
        for i in range(config.BLINKSTICK_TOTAL_LED):
            bstick.set_color(channel=0, index=i, hex="#000000")
            time.sleep(0.1)


def set_led_color(pod_index, color):
    start_led = pod_index * led_per_pod
    for i in range(start_led, start_led + led_per_pod):
        bstick.set_color(channel=0, index=i, hex=color)
        time.sleep(0.1)


def watch_pods(update_blinkstick=False):
    w = watch.Watch()
    pod_index_map = {}
    try:
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

            if update_blinkstick and bstick:
                color = (
                    "#008000"
                    if pod_status == "Running"
                    else "#ffff00" if pod_status == "Pending" else "#ff0000"
                )
                set_led_color(pod_index_map[pod_index], color)

            if not update_blinkstick:
                yield f'data: {{"name": "{pod_name}", "status": "{pod_status}", "index": "{pod_index}"}}\n\n'
    except Exception as e:
        logging.error(f"Error watching pods: {e}")


def background_blinkstick_update():
    while not stop_event.is_set():
        for _ in watch_pods(update_blinkstick=True):
            if stop_event.is_set():
                break
        time.sleep(5)  # Add a small delay to prevent high CPU usage


atexit.register(turn_off_blinkstick)

# Threading setup
stop_event = Event()

# Initialize the background thread and start it
background_thread = Thread(target=background_blinkstick_update, daemon=True)
background_thread.start()


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
        except client.ApiException as e:
            logging.error(f"Chaos monkey couldn't delete pod {pod_name} because {e}")
            return jsonify({"message": f"Deleting of {pod_name} failed"}), 500
        return jsonify({"message": f"Pod {pod_name} deleted"}), 200
    else:
        return jsonify({"message": "No pods available to delete"}), 404


@app.route("/stream")
def stream():
    return Response(
        watch_pods(update_blinkstick=False), content_type="text/event-stream"
    )


@app.route("/shutdown", methods=["POST"])
def shutdown():
    stop_event.set()
    background_thread.join()
    return "Shutting down..."


if __name__ == "__main__":
    flask_debug = config.LOG_LEVEL == "DEBUG"
    try:
        app.run(debug=flask_debug)
    except Exception as e:
        logging.error(e)
