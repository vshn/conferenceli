import time
from gpiozero import OutputDevice
from http.server import BaseHTTPRequestHandler, HTTPServer
import threading

# Relay setup on GPIO pin 23
relay = OutputDevice(23, active_high=False)

# Global variables to keep track of relay state and timer
relay_active_time = 0
max_relay_time = 20
lock = threading.Lock()  # To manage concurrent access


def handle_relay():
    global relay_active_time
    while True:
        if relay_active_time > 0:
            # Turn on the relay if not already on
            if not relay.is_active:
                print("Turning on the relay")
                relay.on()

            # Sleep for one second and decrement the active time
            time.sleep(1)
            with lock:
                relay_active_time -= 1

            # Turn off the relay when time is up
            if relay_active_time <= 0:
                print("Turning off the relay")
                relay.off()
        else:
            # Sleep briefly when no activity is required
            time.sleep(0.1)


class RequestHandler(BaseHTTPRequestHandler):
    def do_HEAD(self):
        global relay_active_time

        # Respond with HTTP 200 OK
        self.send_response(200)
        self.end_headers()

        # Extend relay time
        with lock:
            if relay_active_time < max_relay_time:
                additional_time = min(5, max_relay_time - relay_active_time)
                relay_active_time += additional_time
                print(
                    f"Relay time extended by {additional_time} seconds, total: {relay_active_time} seconds"
                )
            else:
                print("Maximum relay time reached, no further extension")


def run_server():
    server_address = ("", 6543)
    httpd = HTTPServer(server_address, RequestHandler)
    print("Starting web service on port 6543...")
    httpd.serve_forever()


if __name__ == "__main__":
    # Start the relay handling thread
    relay_thread = threading.Thread(target=handle_relay)
    relay_thread.daemon = True
    relay_thread.start()

    # Start the web service
    run_server()
