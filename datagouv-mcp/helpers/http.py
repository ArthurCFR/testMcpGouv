"""Force all httpx.AsyncClient instances to use IPv4.

On cloud platforms (Railway europe-west4, GCP), Python 3.14's Happy Eyeballs
may attempt IPv6 first. Some French government APIs (geo.api.gouv.fr,
api-adresse.data.gouv.fr) are IPv4-only, causing ConnectError.

Call ``patch_httpx_ipv4()`` once at startup to monkey-patch AsyncClient.__init__
so every instance defaults to an IPv4-only transport.
"""

import httpx

_original_init = httpx.AsyncClient.__init__


def _ipv4_init(self, *args, **kwargs):
    if "transport" not in kwargs:
        kwargs["transport"] = httpx.AsyncHTTPTransport(local_address="0.0.0.0")
    _original_init(self, *args, **kwargs)


def patch_httpx_ipv4():
    """Monkey-patch httpx.AsyncClient to default to IPv4. Idempotent."""
    if httpx.AsyncClient.__init__ is not _ipv4_init:
        httpx.AsyncClient.__init__ = _ipv4_init
