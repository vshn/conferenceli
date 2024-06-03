import signal
import sys
import logging
import random
import threading

# Patch all to make the app gevent compatible
from gevent import monkey

monkey.patch_all()

from flask import Flask, render_template, Response, jsonify, request, make_response
from flask_bootstrap import Bootstrap5
from kubernetes import client, watch, config as k8sconfig
from kubernetes.config import ConfigException
from gevent.pywsgi import WSGIServer

from config import *

# Define stop event for graceful shutdown
stop_event = threading.Event()


def create_app():
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
        def decorated(*args, **kwargs):
            auth = request.authorization
            if not auth or not check_auth(auth.username, auth.password):
                return authenticate()
            return f(*args, **kwargs)

        return decorated

    # Define routes
    @app.route("/")
    def index():
        return render_template("index.html")

    @app.route("/chaos")
    @requires_auth
    def chaos():
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

    @app.route("/stream")
    def stream():
        def watch_pods():
            w = watch.Watch()
            try:
                for event in w.stream(
                    v1.list_namespaced_pod, namespace, timeout_seconds=0
                ):
                    pod = event["object"]
                    pod_name = pod.metadata.name
                    pod_status = pod.status.phase
                    pod_index = pod.metadata.labels.get(
                        "statefulset.kubernetes.io/pod-name", "unknown"
                    )

                    yield f'data: {{"name": "{pod_name}", "status": "{pod_status}", "index": "{pod_index}"}}\n\n'
            except Exception as e:
                logging.error(f"Error watching pods: {e}")

        return Response(watch_pods(), content_type="text/event-stream")

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
