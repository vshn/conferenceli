import json
import signal
import sys
import logging
import random
import threading
import time
from functools import wraps

# Patch all to make the app gevent compatible
from gevent import monkey

monkey.patch_all()

import gevent.queue

from flask import (
    Flask,
    render_template,
    Response,
    jsonify,
    request,
    make_response,
    session,
    redirect,
    url_for,
)
from kubernetes import client, watch, config as k8sconfig
from kubernetes.config import ConfigException
from gevent.pywsgi import WSGIServer

from config import *

# Define stop event for graceful shutdown
stop_event = threading.Event()

# In-memory display mode (no persistence; resets to 'day' on app restart)
display_mode = {"value": "day"}

# Operator-configured starting value for the kiosk's "pods destroyed" counter.
# The kiosk's local counter is seeded from this value on initial render and
# whenever the operator pushes a new value via /control/kill-count.
kill_count_seed = {"value": 0}

# Subscribers for the manual theatre-event SSE channel. Each open client gets
# its own gevent.queue.Queue; broadcast_event fans out to all of them.
event_subscribers = []


def broadcast_event(name, **extras):
    payload = {"event": name, **extras}
    for q in list(event_subscribers):
        try:
            q.put_nowait(payload)
        except Exception:
            pass


def create_app():
    # Initialize the Flask app
    app = Flask(__name__)
    app.secret_key = config.FLASK_APP_SECRET_KEY

    # Load kubeconfig or use in-cluster configuration
    kubeconfig_path = config.KUBECONFIG
    try:
        if kubeconfig_path:
            logging.info(f"Loading kubeconfig from {kubeconfig_path}")
            k8sconfig.load_kube_config(config_file=kubeconfig_path)
        else:
            logging.info("Loading in-cluster kubeconfig")
            k8sconfig.load_incluster_config()

        global v1
        v1 = client.CoreV1Api()
        global namespace
        namespace = config.K8S_NAMESPACE
        if not namespace:
            raise ValueError("K8S_NAMESPACE is not defined in the config.")
    except (ConfigException, ValueError) as e:
        logging.fatal(e)
        sys.exit(4)

    # Authentication function
    def check_auth(username, password):
        return (
            username == config.CHAOS_BASIC_AUTH_USERNAME
            and password == config.CHAOS_BASIC_AUTH_PASSWORD
        )

    def authenticate():
        message = {"message": "Authenticate."}
        response = make_response(jsonify(message), 401)
        response.headers["WWW-Authenticate"] = 'Basic realm="Login Required"'
        return response

    def requires_auth(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            auth = request.authorization
            if not auth or not check_auth(auth.username, auth.password):
                return authenticate()
            return f(*args, **kwargs)

        return decorated

    def requires_control_session(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if not session.get("control_authed"):
                return jsonify({"message": "Unauthorized"}), 401
            return f(*args, **kwargs)

        return decorated

    def do_chaos():
        try:
            pods = v1.list_namespaced_pod(namespace).items
            running_pods = [pod for pod in pods if pod.status.phase == "Running"]

            if not running_pods:
                logging.info("No running pods available to delete")
                return jsonify({"message": "No running pods available to delete"}), 404

            pod = random.choice(running_pods)
            pod_name = pod.metadata.name

            try:
                v1.delete_namespaced_pod(pod_name, namespace)
                logging.info(f"Chaos monkey deleted pod {pod_name}")
                return jsonify({"message": f"Pod {pod_name} deleted"}), 200
            except client.ApiException as e:
                logging.error(
                    f"Chaos monkey couldn't delete pod {pod_name} because {e}"
                )
                return jsonify({"message": f"Deleting of {pod_name} failed"}), 500
        except Exception as e:
            logging.error(f"Failed to list pods in namespace {namespace} because {e}")
            return jsonify({"message": "Failed to list pods"}), 500

    def do_chaos_index(pod_index):
        try:
            label_selector = (
                f"statefulset.kubernetes.io/pod-name={pod_index}"
            )
            pods = v1.list_namespaced_pod(
                namespace, label_selector=label_selector
            ).items
            running = [
                p
                for p in pods
                if p.status.phase == "Running"
                and p.metadata.deletion_timestamp is None
            ]
            if not running:
                logging.info(f"No running pod for index {pod_index}")
                return (
                    jsonify({"message": f"No running pod for index {pod_index}"}),
                    404,
                )
            pod = running[0]
            pod_name = pod.metadata.name
            v1.delete_namespaced_pod(pod_name, namespace)
            logging.info(f"Chaos monkey deleted pod {pod_name} (targeted)")
            return jsonify({"message": f"Pod {pod_name} deleted"}), 200
        except client.ApiException as e:
            logging.error(f"Targeted chaos failed for index {pod_index}: {e}")
            return jsonify({"message": "Failed to delete pod"}), 500
        except Exception as e:
            logging.error(f"Targeted chaos error for index {pod_index}: {e}")
            return jsonify({"message": "Failed"}), 500

    def do_toggle_night_mode():
        display_mode["value"] = "day" if display_mode["value"] == "night" else "night"
        logging.info(f"Display mode toggled to {display_mode['value']}")
        return jsonify({"mode": display_mode["value"]})

    # Define routes
    @app.route("/")
    def index():
        return render_template("index.html", kill_count_seed=kill_count_seed["value"])

    @app.route("/chaos")
    @requires_auth
    def chaos():
        return do_chaos()

    @app.route("/stream_pods")
    def stream():
        def watch_pods():
            w = watch.Watch()
            try:
                for event in w.stream(
                    v1.list_namespaced_pod, namespace, timeout_seconds=0
                ):
                    pod = event["object"]
                    pod_name = pod.metadata.name
                    pod_index = pod.metadata.labels.get(
                        "statefulset.kubernetes.io/pod-name", "unknown"
                    )
                    pod_node = pod.spec.node_name if pod.spec.node_name else "unknown"

                    pod_status = pod.status.phase
                    if pod.metadata.deletion_timestamp is not None:
                        pod_status = "Terminating"

                    yield f'data: {{"name": "{pod_name}", "status": "{pod_status}", "index": "{pod_index}", "node": "{pod_node}"}}\n\n'
            except Exception as e:
                logging.error(f"Error watching pods: {e}")

        return Response(watch_pods(), content_type="text/event-stream")

    @app.route("/stream_nodes")
    def stream_nodes():
        def watch_nodes():
            w = watch.Watch()
            try:
                for event in w.stream(v1.list_node, timeout_seconds=0):
                    node = event["object"]

                    # Skip nodes with SchedulingDisabled status
                    if node.spec.unschedulable:
                        continue

                    node_name = node.metadata.name
                    node_status = "Unknown"

                    # Extract node conditions
                    for condition in node.status.conditions:
                        if condition.type == "Ready":
                            node_status = (
                                "KubeletReady"
                                if condition.status == "True"
                                else "NotReady"
                            )
                            break

                    # Extract additional node information
                    node_info = node.status.node_info
                    kubelet_version = node_info.kubelet_version
                    architecture = node_info.architecture
                    kernel_version = node_info.kernel_version
                    os_image = node_info.os_image

                    # Send all the node data as part of the SSE event
                    yield f'data: {{"name": "{node_name}", "status": "{node_status}", "kubeletVersion": "{kubelet_version}", "architecture": "{architecture}", "kernelVersion": "{kernel_version}", "osImage": "{os_image}"}}\n\n'
            except Exception as e:
                logging.error(f"Error watching nodes: {e}")

        return Response(watch_nodes(), content_type="text/event-stream")

    @app.route("/nightmode")
    @requires_auth
    def toggle_night_mode():
        return do_toggle_night_mode()

    @app.route("/control", methods=["GET", "POST"])
    def control():
        error = None
        if request.method == "POST":
            password = request.form.get("password", "")
            if password == config.CHAOS_BASIC_AUTH_PASSWORD:
                session["control_authed"] = True
                return redirect(url_for("control"))
            error = "Invalid password"
        return render_template(
            "control.html",
            authed=session.get("control_authed", False),
            error=error,
        )

    @app.route("/control/logout", methods=["POST"])
    def control_logout():
        session.pop("control_authed", None)
        return redirect(url_for("control"))

    @app.route("/control/chaos", methods=["POST"])
    @requires_control_session
    def control_chaos():
        return do_chaos()

    @app.route("/control/nightmode", methods=["POST"])
    @requires_control_session
    def control_nightmode():
        return do_toggle_night_mode()

    @app.route("/control/chaos/<pod_index>", methods=["POST"])
    @requires_control_session
    def control_chaos_index(pod_index):
        return do_chaos_index(pod_index)

    # The kiosk page itself triggers targeted kills at the climax of a theatre
    # animation. The kiosk has no session, so this sibling endpoint is open —
    # same risk profile as /stream_pods, which is also public.
    @app.route("/theatre/chaos/<pod_index>", methods=["POST"])
    def theatre_chaos_index(pod_index):
        return do_chaos_index(pod_index)

    @app.route("/control/event/<event_name>", methods=["POST"])
    @requires_control_session
    def control_event(event_name):
        broadcast_event(event_name)
        logging.info(f"Theatre event triggered: {event_name}")
        return jsonify({"message": f"Event {event_name} fired"}), 200

    @app.route("/control/kill-count", methods=["POST"])
    @requires_control_session
    def control_kill_count():
        data = request.get_json(silent=True) or request.form
        try:
            n = int(data.get("value", 0))
        except (TypeError, ValueError):
            return jsonify({"message": "Invalid value"}), 400
        if n < 0:
            n = 0
        kill_count_seed["value"] = n
        broadcast_event("kill-count", value=n)
        logging.info(f"Kill count seeded to {n}")
        return jsonify({"message": f"Kill count set to {n}"}), 200

    @app.route("/stream_events")
    def stream_events():
        # Each subscriber gets its own queue; broadcast_event fans out to all.
        # gevent.queue.Queue.get() yields cooperatively.
        def watch_events():
            q = gevent.queue.Queue()
            event_subscribers.append(q)
            try:
                while True:
                    try:
                        payload = q.get(timeout=15)
                        yield f"data: {json.dumps(payload)}\n\n"
                    except gevent.queue.Empty:
                        # Heartbeat keeps proxies from idle-closing the connection
                        # and surfaces dead sockets so the finally block can clean up.
                        yield ": keepalive\n\n"
            finally:
                try:
                    event_subscribers.remove(q)
                except ValueError:
                    pass

        return Response(watch_events(), content_type="text/event-stream")

    @app.route("/stream_mode")
    def stream_mode():
        # Polls the in-memory mode every second and streams changes via SSE.
        # gevent monkey-patches time.sleep so this is cooperative.
        def watch_mode():
            last = None
            ticks = 0
            while True:
                current = display_mode["value"]
                if current != last:
                    last = current
                    ticks = 0
                    yield f'data: {{"mode": "{current}"}}\n\n'
                else:
                    ticks += 1
                    if ticks >= 15:
                        ticks = 0
                        yield ": keepalive\n\n"
                time.sleep(1)

        return Response(watch_mode(), content_type="text/event-stream")

    @app.route("/shutdown", methods=["POST"])
    def shutdown():
        handle_shutdown(signal.SIGTERM, None)
        return "Shutting down..."

    return app


# Graceful shutdown
def handle_shutdown(signum, frame):
    logging.info("Received shutdown signal")
    stop_event.set()
    sys.exit(0)


signal.signal(signal.SIGTERM, handle_shutdown)
signal.signal(signal.SIGINT, handle_shutdown)

# Create the app instance
app = create_app()

if __name__ == "__main__":
    flask_debug = config.LOG_LEVEL == "DEBUG"
    try:
        http_server = WSGIServer(("0.0.0.0", 5000), app)
        http_server.serve_forever()
    except Exception as e:
        logging.error(e)
