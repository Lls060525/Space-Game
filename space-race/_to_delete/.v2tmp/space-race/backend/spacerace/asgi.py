import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "spacerace.settings")

from django.core.asgi import get_asgi_application  # noqa: E402

django_asgi_app = get_asgi_application()  # must run before importing models/consumers

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from channels.security.websocket import AllowedHostsOriginValidator  # noqa: E402

from game.middleware import PresenceMiddleware, TokenAuthMiddleware  # noqa: E402
from game.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": AllowedHostsOriginValidator(
        TokenAuthMiddleware(PresenceMiddleware(URLRouter(websocket_urlpatterns)))
    ),
})
