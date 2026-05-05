import logging
import re
import time
import signal
import sys
from kubernetes import client, config as k8sconfig, watch
from kubernetes.config import ConfigException
from blinkstick import blinkstick
from usb.core import NoBackendError, USBError

from config import *

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
    exit(1)

# Blinkstick setup
try:
    bstick = blinkstick.find_first()
    if not bstick:
        logging.fatal("No BlinkStick found")
        exit(1)
    else:
        logging.info(
            f"BlinkStick found: {bstick.get_description()} - {bstick.get_serial()}"
        )
        bstick.set_led_count(config.BLINKSTICK_TOTAL_LED)
        led_per_pod = config.BLINKSTICK_GROUP_LED
except (NoBackendError, USBError) as e:
    logging.fatal(f"BlinkStick setup failed: {e}")
    exit(1)


# Ensure Blinkstick is turned off on exit
def turn_off_blinkstick(signum=None, frame=None):
    logging.info("Turning off BlinkStick")
    for i in range(config.BLINKSTICK_TOTAL_LED):
        bstick.set_color(channel=0, index=i, hex="#000000")
        time.sleep(0.1)

    logging.info("BlinkStick controller stopped")
    sys.exit(0)


# Register signal handlers for graceful shutdown
signal.signal(signal.SIGINT, turn_off_blinkstick)
signal.signal(signal.SIGTERM, turn_off_blinkstick)
signal.signal(signal.SIGQUIT, turn_off_blinkstick)
signal.signal(signal.SIGHUP, turn_off_blinkstick)


def set_led_color(pod_index, color):
    start_led = pod_index * led_per_pod
    for i in range(start_led, start_led + led_per_pod):
        logging.debug(f"Setting color of LED {i} to {color}")
        bstick.set_color(channel=0, index=i, hex=color)
        time.sleep(0.1)


# StatefulSet pod names end in their ordinal (e.g. "http-echo-4" → 4). The
# ordinal is what each physical box is wired to, so we map LEDs by ordinal
# rather than insertion order — restarts and out-of-order watch events would
# otherwise scramble the mapping.
_ORDINAL_RE = re.compile(r"-(\d+)$")


def parse_pod_ordinal(pod_name_label):
    m = _ORDINAL_RE.search(pod_name_label or "")
    return int(m.group(1)) if m else None


def watch_pods():
    while True:
        w = watch.Watch()
        try:
            for event in w.stream(
                v1.list_namespaced_pod, namespace, timeout_seconds=0
            ):
                pod = event["object"]

                pod_status = pod.status.phase
                if pod.metadata.deletion_timestamp is not None:
                    pod_status = "Terminating"

                pod_name_label = pod.metadata.labels.get(
                    "statefulset.kubernetes.io/pod-name", ""
                )
                ordinal = parse_pod_ordinal(pod_name_label)
                if ordinal is None:
                    logging.debug(
                        f"Skipping pod without StatefulSet ordinal: {pod_name_label!r}"
                    )
                    continue

                if bstick:
                    color = (
                        "#008000"
                        if pod_status == "Running"
                        else "#ffff00" if pod_status == "Pending" else "#ff0000"
                    )
                    set_led_color(ordinal, color)
        except Exception as e:
            logging.error(f"Error watching pods, reconnecting in 2s: {e}")
            time.sleep(2)


if __name__ == "__main__":
    try:
        watch_pods()
    except KeyboardInterrupt:
        turn_off_blinkstick()
        logging.info("BlinkStick controller stopped")
