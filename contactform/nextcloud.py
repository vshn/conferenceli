import logging
import threading
from urllib.parse import quote, urlparse

import requests

from config import config

# Uploads replace the whole remote file, so let them run one at a time to avoid
# two leads submitted seconds apart racing each other on the same target.
_upload_lock = threading.Lock()

UPLOAD_TIMEOUT = 30


def campaign_filename(campaign_name):
    """Turn a campaign name into a CSV file name: lowercase, dashes instead of spaces."""
    slug = "-".join((campaign_name or "").lower().split()) or "leads"
    return f"{slug}.csv"


def share_webdav_url(share_url, filename):
    """Build the public WebDAV URL for a file inside a Nextcloud share link.

    Accepts the share links Nextcloud hands out, e.g.
    https://cloud.example.com/s/TOKEN, .../index.php/s/TOKEN or
    https://example.com/nextcloud/s/TOKEN/download, and returns the target URL
    plus the share token (which doubles as the WebDAV username).
    """
    parsed = urlparse(share_url.strip())
    parts = [p for p in parsed.path.split("/") if p]

    if "s" in parts:
        index = parts.index("s")
        token = parts[index + 1] if len(parts) > index + 1 else ""
        # Keep any subpath the instance is hosted under, drop the legacy index.php.
        prefix = [p for p in parts[:index] if p != "index.php"]
    else:
        token = parts[-1] if parts else ""
        prefix = []

    if not parsed.scheme or not parsed.netloc or not token:
        raise ValueError(f"Not a usable Nextcloud share URL: {share_url}")

    base = f"{parsed.scheme}://{parsed.netloc}"
    if prefix:
        base += "/" + "/".join(prefix)

    return f"{base}/public.php/dav/files/{token}/{quote(filename)}", token


def _upload(file_path, campaign_name):
    filename = campaign_filename(campaign_name)
    with _upload_lock:
        try:
            url, token = share_webdav_url(config.NEXTCLOUD_SHARE_URL, filename)
            with open(file_path, "rb") as csv_file:
                response = requests.put(
                    url,
                    data=csv_file,
                    auth=(token, config.NEXTCLOUD_SHARE_PASSWORD),
                    timeout=UPLOAD_TIMEOUT,
                )
            if response.ok:
                logging.info(f"Uploaded leads CSV to Nextcloud as {filename}")
            else:
                logging.error(
                    f"Couldn't upload leads CSV to Nextcloud as {filename}: "
                    f"HTTP {response.status_code} {response.text[:200]}"
                )
        except Exception as e:
            logging.error(f"Couldn't upload leads CSV to Nextcloud as {filename}: {e}")


def upload_csv(file_path, campaign_name):
    """Upload the leads CSV to Nextcloud in the background.

    Best effort only: does nothing when no share is configured and never raises,
    so a broken or missing Nextcloud can't take the contact form down.
    """
    if not config.NEXTCLOUD_SHARE_URL:
        logging.debug("NEXTCLOUD_SHARE_URL is not set, skipping leads CSV upload")
        return

    threading.Thread(
        target=_upload,
        args=(file_path, campaign_name),
        daemon=True,
    ).start()
