from pathlib import Path

from django.contrib import admin
from django.http import FileResponse, Http404
from django.urls import include, path, re_path
from django.views.static import serve

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("game.urls")),
]

# Single-host deploy: if the frontend has been built (frontend/dist), Django serves it too,
# so the API and the WebSockets share one origin and no proxy is needed.
DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


def spa(request, path=""):
    index = DIST / "index.html"
    if not index.exists():
        raise Http404("Frontend not built: run `npm run build` in frontend/ (or use `npm run dev`).")
    return FileResponse(open(index, "rb"), content_type="text/html")


if DIST.exists():
    urlpatterns += [
        re_path(r"^assets/(?P<path>.*)$", serve, {"document_root": DIST / "assets"}),
        re_path(r"^(?!api/|admin/|ws/).*$", spa),
    ]
