#!/usr/bin/env python3

import os
import sys
import time
import threading
import multiprocessing
import json
import signal
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
import random
import math

class DemoApp:
    def __init__(self):
        # Configuration from environment variables
        self.startup_delay = int(os.getenv('STARTUP_DELAY', '10'))
        self.cpu_pattern = os.getenv('CPU_PATTERN', 'constant')  # constant, sine, random, burst
        self.cpu_intensity = float(os.getenv('CPU_INTENSITY', '0.5'))  # 0.0 to 1.0
        self.status_interval = int(os.getenv('STATUS_INTERVAL', '10'))  # seconds
        self.http_port = int(os.getenv('HTTP_PORT', '8080'))

        # State tracking
        self.start_time = datetime.now()
        self.is_ready = False
        self.is_running = True
        self.current_cpu_target = 0.0
        self.cpu_workers = []
        self.status_thread = None
        self.http_server = None

        # Setup signal handling for graceful shutdown
        signal.signal(signal.SIGTERM, self._signal_handler)
        signal.signal(signal.SIGINT, self._signal_handler)

    def _signal_handler(self, signum, frame):
        self.log(f"Received signal {signum}, shutting down gracefully...")
        self.shutdown()

    def log(self, message):
        """Log with timestamp"""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] {message}", flush=True)

    def simulate_startup(self):
        """Simulate slow startup with progress updates"""
        self.log(f"🚀 Application starting with {self.startup_delay}s startup delay")
        self.log(f"📊 CPU pattern: {self.cpu_pattern}, intensity: {self.cpu_intensity}")

        # Simulate various startup phases
        phases = [
            ("Initializing configuration", 0.2),
            ("Loading dependencies", 0.3),
            ("Connecting to services", 0.2),
            ("Warming up caches", 0.2),
            ("Final preparations", 0.1)
        ]

        for phase, duration_ratio in phases:
            phase_duration = self.startup_delay * duration_ratio
            self.log(f"⏳ {phase}...")

            # Show progress during longer phases
            if phase_duration > 5:
                steps = int(phase_duration)
                for i in range(steps):
                    time.sleep(1)
                    progress = ((i + 1) / steps) * 100
                    self.log(f"   Progress: {progress:.0f}%")
            else:
                time.sleep(phase_duration)

        self.is_ready = True
        self.log("✅ Application ready!")

    def cpu_worker(self, worker_id):
        """CPU intensive worker thread"""
        self.log(f"🔧 CPU worker {worker_id} started")

        while self.is_running:
            if self.current_cpu_target > 0:
                # Calculate work duration based on target CPU usage
                work_duration = 0.1 * self.current_cpu_target
                sleep_duration = 0.1 * (1 - self.current_cpu_target)

                # Do CPU intensive work
                start = time.time()
                while time.time() - start < work_duration:
                    # Mathematical operations to consume CPU
                    math.sqrt(random.random() * 1000000)

                time.sleep(sleep_duration)
            else:
                time.sleep(0.1)

    def update_cpu_pattern(self):
        """Update CPU usage based on the configured pattern"""
        elapsed = (datetime.now() - self.start_time).total_seconds()

        if self.cpu_pattern == 'constant':
            self.current_cpu_target = self.cpu_intensity

        elif self.cpu_pattern == 'sine':
            # Sine wave pattern with 60-second period
            self.current_cpu_target = (math.sin(elapsed / 60 * 2 * math.pi) + 1) / 2 * self.cpu_intensity

        elif self.cpu_pattern == 'random':
            # Random walk
            change = random.uniform(-0.1, 0.1)
            self.current_cpu_target = max(0, min(1, self.current_cpu_target + change))
            self.current_cpu_target *= self.cpu_intensity

        elif self.cpu_pattern == 'burst':
            # Burst pattern: high CPU for 30s, low CPU for 30s
            cycle_position = elapsed % 60
            if cycle_position < 30:
                self.current_cpu_target = self.cpu_intensity
            else:
                self.current_cpu_target = self.cpu_intensity * 0.1

        elif self.cpu_pattern == 'ramp':
            # Gradually increase CPU usage over 5 minutes, then reset
            cycle_position = elapsed % 300  # 5 minutes
            ramp_progress = cycle_position / 300
            self.current_cpu_target = ramp_progress * self.cpu_intensity

    def status_reporter(self):
        """Report status periodically"""
        while self.is_running:
            if self.is_ready:
                uptime = (datetime.now() - self.start_time).total_seconds()
                self.update_cpu_pattern()

                status = {
                    "status": "running",
                    "uptime_seconds": int(uptime),
                    "cpu_pattern": self.cpu_pattern,
                    "cpu_target": f"{self.current_cpu_target:.2f}",
                    "cpu_intensity": self.cpu_intensity,
                    "active_workers": len([w for w in self.cpu_workers if w.is_alive()]),
                    "memory_info": f"RSS: {self._get_memory_usage():.1f}MB"
                }

                self.log(f"📈 Status: {json.dumps(status, indent=2)}")

            time.sleep(self.status_interval)

    def _get_memory_usage(self):
        """Get memory usage in MB"""
        try:
            import psutil
            process = psutil.Process(os.getpid())
            return process.memory_info().rss / 1024 / 1024
        except ImportError:
            # Fallback if psutil not available
            return 0.0

    class HealthHandler(BaseHTTPRequestHandler):
        def __init__(self, request, client_address, server, app_instance):
            self.app_instance = app_instance
            super().__init__(request, client_address, server)

        def do_GET(self):
            if self.path == '/health':
                if self.app_instance.is_ready:
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()

                    response = {
                        "status": "healthy",
                        "ready": self.app_instance.is_ready,
                        "uptime": int((datetime.now() - self.app_instance.start_time).total_seconds()),
                        "cpu_target": self.app_instance.current_cpu_target
                    }
                    self.wfile.write(json.dumps(response).encode())
                else:
                    self.send_response(503)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    response = {"status": "starting", "ready": False}
                    self.wfile.write(json.dumps(response).encode())
            else:
                self.send_response(404)
                self.end_headers()

        def log_message(self, format, *args):
            # Suppress HTTP server logs
            pass

    def start_http_server(self):
        """Start HTTP server for health checks"""
        try:
            def handler_factory(*args, **kwargs):
                return self.HealthHandler(*args, app_instance=self, **kwargs)

            self.http_server = HTTPServer(('0.0.0.0', self.http_port), handler_factory)

            def serve():
                self.log(f"🌐 HTTP server starting on port {self.http_port}")
                self.http_server.serve_forever()

            http_thread = threading.Thread(target=serve, daemon=True)
            http_thread.start()
        except Exception as e:
            self.log(f"❌ Failed to start HTTP server: {e}")

    def run(self):
        """Main application loop"""
        try:
            # Start HTTP server
            self.start_http_server()

            # Simulate startup
            self.simulate_startup()

            # Start CPU workers
            cpu_count = multiprocessing.cpu_count()
            worker_count = min(cpu_count, 4)  # Limit to 4 workers max

            for i in range(worker_count):
                worker = threading.Thread(target=self.cpu_worker, args=(i,), daemon=True)
                worker.start()
                self.cpu_workers.append(worker)

            self.log(f"🔥 Started {worker_count} CPU workers")

            # Start status reporter
            self.status_thread = threading.Thread(target=self.status_reporter, daemon=True)
            self.status_thread.start()

            # Main loop
            self.log("🎯 Entering main application loop")
            while self.is_running:
                time.sleep(1)

        except Exception as e:
            self.log(f"❌ Application error: {e}")
            raise

    def shutdown(self):
        """Graceful shutdown"""
        self.log("🛑 Shutting down application...")
        self.is_running = False

        if self.http_server:
            self.http_server.shutdown()

        self.log("👋 Application stopped")
        sys.exit(0)

if __name__ == "__main__":
    app = DemoApp()
    app.run()
