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

led_per_pod = config.BLINKSTICK_GROUP_LED
bstick = None


def connect_blinkstick():
    stick = blinkstick.find_first()
    if not stick:
        return None
    stick.set_led_count(config.BLINKSTICK_TOTAL_LED)
    logging.info(
        f"BlinkStick connected: {stick.get_description()} - {stick.get_serial()}"
    )
    return stick


def reconnect_blinkstick():
    global bstick
    bstick = None
    delay = 2
    while bstick is None:
        try:
            bstick = connect_blinkstick()
        except Exception as e:
            logging.error(f"BlinkStick reconnect failed: {e}")
            bstick = None
        if bstick is None:
            logging.error(f"No BlinkStick found, retrying in {delay}s")
            time.sleep(delay)
            delay = min(delay * 2, 30)


try:
    bstick = connect_blinkstick()
    if not bstick:
        logging.fatal("No BlinkStick found")
        exit(1)
except (NoBackendError, USBError) as e:
    logging.fatal(f"BlinkStick setup failed: {e}")
    exit(1)


# Ensure Blinkstick is turned off on exit
def turn_off_blinkstick(signum=None, frame=None):
    logging.info("Turning off BlinkStick")
    if bstick is not None:
        try:
            for i in range(config.BLINKSTICK_TOTAL_LED):
                bstick.set_color(channel=0, index=i, hex="#000000")
                time.sleep(0.1)
        except Exception as e:
            logging.warning(f"Failed to turn off BlinkStick cleanly: {e}")

    logging.info("BlinkStick controller stopped")
    sys.exit(0)


# Register signal handlers for graceful shutdown
signal.signal(signal.SIGINT, turn_off_blinkstick)
signal.signal(signal.SIGTERM, turn_off_blinkstick)
signal.signal(signal.SIGQUIT, turn_off_blinkstick)
signal.signal(signal.SIGHUP, turn_off_blinkstick)


def set_led_color(pod_index, color):
    if bstick is None:
        return
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
            # USB errors invalidate the bstick handle; re-acquire before
            # restarting the watch so subsequent set_color calls succeed.
            if isinstance(e, (NoBackendError, USBError)) or "BlinkStick" in str(e):
                reconnect_blinkstick()


if __name__ == "__main__":
    try:
        watch_pods()
    except KeyboardInterrupt:
        turn_off_blinkstick()
        logging.info("BlinkStick controller stopped")
