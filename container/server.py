"""HTTP server for stealth-webtools.

Exposes two endpoints backed by a single shared CloakBrowser:

    POST /fetch     body {"url"}  -> JSON {html, finalUrl, contentType}
    POST /snapshot  body {"url"}  -> JSON {html, screenshotBase64, finalUrl, contentType}

Each request runs in its own browser.new_context() so cookies / storage are
isolated. The browser itself is launched once on startup; recovery from a
crashed browser is handled by the Worker calling Container.destroy().
"""

from __future__ import annotations

import asyncio
import base64
import logging
import os
from urllib.parse import urlparse

from aiohttp import web
from cloakbrowser import launch_async

PORT = 8000
NAV_TIMEOUT_MS = 10_000
VIEWPORT = {"width": 1440, "height": 767}

TRANSPARENT_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgAAAAAgABc3UBGAAAAABJRU5ErkJggg=="
)

EAGER_LAZY_JS = """
(() => {
  class EagerIO {
    constructor(cb) { this.cb = cb; }
    observe(el) {
      queueMicrotask(() => this.cb([{ isIntersecting: true, target: el, intersectionRatio: 1 }]));
    }
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  }
  window.IntersectionObserver = EagerIO;

  const flip = (el) => {
    if (el.tagName === 'IMG' && el.getAttribute('loading') === 'lazy') {
      el.setAttribute('loading', 'eager');
    }
  };
  new MutationObserver((muts) => {
    for (const mut of muts) {
      for (const node of mut.addedNodes) {
        if (node.nodeType !== 1) continue;
        flip(node);
        for (const img of node.querySelectorAll('img[loading="lazy"]')) flip(img);
      }
    }
  }).observe(document, { childList: true, subtree: true });
})();
"""

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("stealth-webtools")


async def _block_text_resources(route) -> None:
    rt = route.request.resource_type
    if rt == "image":
        await route.fulfill(status=200, content_type="image/png", body=TRANSPARENT_PNG)
    elif rt in ("media", "font"):
        await route.abort()
    else:
        await route.continue_()


async def _wait_anubis(page) -> None:
    await page.wait_for_selector("#anubis_challenge", state="detached", timeout=NAV_TIMEOUT_MS)


async def _wait_brave_captcha(page) -> None:
    await page.wait_for_load_state("networkidle", timeout=NAV_TIMEOUT_MS)
    await page.wait_for_selector(".captcha-card", state="hidden", timeout=NAV_TIMEOUT_MS)


SITE_HANDLERS = {
    "search.brave.com": _wait_brave_captcha,
}


async def _settle(page, url: str) -> None:
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
    except Exception as exc:
        log.info("goto error (continuing with partial page): %s", exc)
    host = urlparse(url).hostname or ""
    try:
        await SITE_HANDLERS.get(host, _wait_anubis)(page)
    except Exception as exc:
        log.info("site handler error (continuing): %s", exc)
    try:
        await page.wait_for_load_state("networkidle", timeout=NAV_TIMEOUT_MS)
    except Exception:
        pass


async def _capture(page) -> tuple[str, str, str]:
    final_url = page.url
    try:
        content_type = await page.evaluate("document.contentType")
    except Exception:
        content_type = ""
    html = await page.content()
    return html, final_url, content_type or ""


def _require_url(data: dict) -> str:
    url = data.get("url")
    if not isinstance(url, str) or not url.startswith(("http://", "https://")):
        raise web.HTTPBadRequest(reason="`url` must be http(s)")
    return url


async def handle_fetch(request: web.Request) -> web.Response:
    url = _require_url(await request.json())
    browser = request.app["browser"]
    context = await browser.new_context(viewport=VIEWPORT)
    try:
        await context.route("**/*", _block_text_resources)
        page = await context.new_page()
        await _settle(page, url)
        html, final_url, content_type = await _capture(page)
    finally:
        await context.close()
    return web.json_response({"html": html, "finalUrl": final_url, "contentType": content_type})


async def handle_snapshot(request: web.Request) -> web.Response:
    url = _require_url(await request.json())
    browser = request.app["browser"]
    context = await browser.new_context(viewport=VIEWPORT)
    try:
        await context.add_init_script(EAGER_LAZY_JS)
        page = await context.new_page()
        await _settle(page, url)
        png = await page.screenshot(full_page=True, type="png")
        html, final_url, content_type = await _capture(page)
    finally:
        await context.close()
    return web.json_response(
        {
            "html": html,
            "screenshotBase64": base64.b64encode(png).decode("ascii"),
            "finalUrl": final_url,
            "contentType": content_type,
        }
    )


async def handle_health(_: web.Request) -> web.Response:
    return web.json_response({"ok": True})


@web.middleware
async def exit_on_dead_browser(request: web.Request, handler):
    """If the shared browser is gone, schedule a hard process exit so
    Cloudflare Containers rehydrates on the next request. Without this the
    server would keep returning 500s forever after a browser crash."""
    try:
        return await handler(request)
    finally:
        browser = request.app.get("browser")
        if browser is not None and not browser.is_connected():
            log.error("browser disconnected; exiting for container restart")
            asyncio.get_running_loop().call_later(0.5, lambda: os._exit(1))


async def on_startup(app: web.Application) -> None:
    log.info("launching CloakBrowser...")
    app["browser"] = await launch_async(headless=False, humanize=True)
    log.info("CloakBrowser ready")


async def on_cleanup(app: web.Application) -> None:
    browser = app.get("browser")
    if browser is not None:
        try:
            await browser.close()
        except Exception as exc:
            log.warning("browser close failed: %s", exc)


def main() -> None:
    app = web.Application(client_max_size=1024 * 1024 * 16, middlewares=[exit_on_dead_browser])
    app.router.add_get("/", handle_health)
    app.router.add_post("/fetch", handle_fetch)
    app.router.add_post("/snapshot", handle_snapshot)
    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
    web.run_app(app, host="0.0.0.0", port=PORT, print=None)


if __name__ == "__main__":
    main()
