import xmlrpc.client
import logging


class OdooClient:
    def __init__(self, url, db, username, password):
        self.url = url
        self.db = db
        self.username = username
        self.password = password
        self.common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common")
        self.models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object")
        self.uid = self.authenticate()

    def authenticate(self):
        logging.info(f"Authenticating against {self.url} as {self.username}")
        return self.common.authenticate(self.db, self.username, self.password, {})

    def search_read(self, model, domain, fields, order="id"):
        return self.models.execute_kw(
            self.db,
            self.uid,
            self.password,
            model,
            "search_read",
            [domain],
            {"fields": fields, "order": order},
        )

    def create(self, model, data):
        return self.models.execute_kw(
            self.db, self.uid, self.password, model, "create", [data]
        )

    def find_id_by_name(self, model, name):
        logging.debug(f"Searching for id of '{name}' in model '{model}'")
        records = self.search_read(model, [("name", "=", name)], ["id"])
        if records:
            return records[0]["id"]
        else:
            raise ValueError(f"No record found for name '{name}' in model '{model}'.")


def load_countries(odoo_client):
    """Country choices grouped into real <optgroup>s.

    WTForms renders a dict of choices as option groups, which beats the old
    "---" separator row: the native mobile picker shows the group headers, so
    the handful of countries we actually see at booths stay at the top.
    """
    odoo_countries = odoo_client.search_read(
        "res.country", [("id", "!=", 0)], ["id", "name"], "name"
    )

    preferred_countries = ["Switzerland", "Germany", "Austria", "France", "Italy"]

    countries = [(str(item["id"]), item["name"]) for item in odoo_countries]
    preferred = [(cid, name) for cid, name in countries if name in preferred_countries]
    others = [(cid, name) for cid, name in countries if name not in preferred_countries]

    preferred_sorted = sorted(preferred, key=lambda x: preferred_countries.index(x[1]))
    others_sorted = sorted(others, key=lambda x: x[1])

    if not preferred_sorted:
        return {"All countries": others_sorted}

    return {
        "Nearby": preferred_sorted,
        "All countries": others_sorted,
    }
