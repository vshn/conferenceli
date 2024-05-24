import os
import xmlrpc.client


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
        return self.common.authenticate(self.db, self.username, self.password, {})

    def search_read(self, model, domain, fields, order=None):
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


def load_countries(odoo_client):
    odoo_countries = odoo_client.search_read(
        "res.country", [("id", "!=", 0)], ["id", "name"], "name"
    )

    preferred_countries = ["Switzerland", "Germany", "Austria", "France", "Italy"]

    countries = [(str(item["id"]), item["name"]) for item in odoo_countries]
    preferred = [(cid, name) for cid, name in countries if name in preferred_countries]
    others = [(cid, name) for cid, name in countries if name not in preferred_countries]

    preferred_sorted = sorted(preferred, key=lambda x: preferred_countries.index(x[1]))
    others_sorted = sorted(others, key=lambda x: x[1])
    sorted_countries = preferred_sorted + others_sorted

    return sorted_countries
