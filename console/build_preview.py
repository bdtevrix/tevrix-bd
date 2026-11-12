"""Build the clickable preview: the real Web.gs and Dashboard.html running on sample data.

dist/preview.html       page body for publishing as an artifact (no doctype/html/head/body)
dist/preview-test.html  the same page wrapped in a full document, for local browser tests
"""
from pathlib import Path

root = Path(__file__).parent
read = lambda p: (root / p).read_text(encoding="utf-8")

def script(src: str) -> str:
    assert "</script" not in src.lower(), "a script contains a closing script tag"
    return "<script>\n" + src + "\n</script>\n"

page = (
    "<title>Tevrix BD Console</title>\n"
    "<script>window.__HM_PREVIEW__ = true;</script>\n"
    + script(read("preview/fakegas.js"))
    + script(read("preview/sample.js"))
    + script(read("../apps-script/Web.gs"))
    + script(read("preview/automation-fake.js"))
    + script(read("preview/shim.js"))
    + read("../apps-script/Dashboard.html")
)
out = root / "dist"
out.mkdir(exist_ok=True)
(out / "preview.html").write_text(page, encoding="utf-8")
(out / "preview-test.html").write_text(
    '<!doctype html><html><head><meta charset="utf-8">'
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
    "</head><body>\n" + page + "\n</body></html>",
    encoding="utf-8",
)
(out / "preview-empty-test.html").write_text(
    '<!doctype html><html><head><meta charset="utf-8">'
    '<meta name="viewport" content="width=device-width, initial-scale=1">'
    "<script>window.__HM_EMPTY__ = true;</script></head><body>\n" + page + "\n</body></html>",
    encoding="utf-8",
)
print("preview.html", len(page.encode()) // 1024, "KB")
