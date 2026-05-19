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
from urllib.parse import urlparse

from aiohttp import web
from cloakbrowser import launch_async

PORT = 8000
NAV_TIMEOUT_MS = 10_000
VIEWPORT = {"width": 1440, "height": 767}

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


async def _wait_generic(page) -> None:
    await page.wait_for_selector(
        "#anubis_challenge", state="detached", timeout=NAV_TIMEOUT_MS
    )
    await page.wait_for_load_state("networkidle", timeout=NAV_TIMEOUT_MS)


async def _wait_brave(page) -> None:
    await page.wait_for_selector(
        '#pow-captcha-content, div.snippet[data-type="web"]', timeout=NAV_TIMEOUT_MS
    )
    if await page.query_selector("#pow-captcha-content"):
        await page.click('button:has-text("I\'m not a robot")', timeout=NAV_TIMEOUT_MS)
        await page.wait_for_selector(
            "#pow-captcha-content", state="detached", timeout=NAV_TIMEOUT_MS
        )


SITE_HANDLERS = {
    "search.brave.com": _wait_brave,
}


async def _settle(page, url: str) -> None:
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
    except Exception as exc:
        log.info("goto error: %s", exc)
    host = urlparse(url).hostname or ""
    try:
        await SITE_HANDLERS.get(host, _wait_generic)(page)
    except Exception as exc:
        log.info("site handler error: %s", exc)


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
        page = await context.new_page()
        await _settle(page, url)
        html, final_url, content_type = await _capture(page)
    finally:
        await context.close()
    return web.json_response(
        {"html": html, "finalUrl": final_url, "contentType": content_type}
    )


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


async def handle_health(request: web.Request) -> web.Response:
    browser = request.app.get("browser")
    connected = bool(browser is not None and browser.is_connected())
    status = 200 if connected else 503
    return web.json_response({"ok": connected}, status=status)


async def _launch_browser():
    return await launch_async(headless=False, humanize=True)


async def _restart_browser(app: web.Application) -> None:
    async with app["restart_lock"]:
        browser = app.get("browser")
        if browser is not None and browser.is_connected():
            return
        log.warning("CloakBrowser restart starting")
        if browser is not None:
            try:
                await browser.close()
            except Exception as exc:
                log.warning("failed to close disconnected CloakBrowser: %s", exc)
        try:
            app["browser"] = await _launch_browser()
        except Exception:
            log.exception("CloakBrowser restart failed")
            return
        log.info("CloakBrowser restarted")


@web.middleware
async def restart_on_dead_browser(request: web.Request, handler):
    try:
        return await handler(request)
    finally:
        browser = request.app.get("browser")
        if browser is not None and not browser.is_connected():
            log.error("browser disconnected; scheduling restart")
            asyncio.create_task(_restart_browser(request.app))


async def on_startup(app: web.Application) -> None:
    log.info("launching CloakBrowser...")
    app["restart_lock"] = asyncio.Lock()
    app["browser"] = await _launch_browser()
    log.info("CloakBrowser ready")


async def on_cleanup(app: web.Application) -> None:
    browser = app.get("browser")
    if browser is not None:
        try:
            await browser.close()
        except Exception as exc:
            log.warning("browser close failed: %s", exc)


def main() -> None:
    app = web.Application(
        client_max_size=1024 * 1024 * 16, middlewares=[restart_on_dead_browser]
    )
    app.router.add_get("/", handle_health)
    app.router.add_post("/fetch", handle_fetch)
    app.router.add_post("/snapshot", handle_snapshot)
    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
    web.run_app(app, host="0.0.0.0", port=PORT, print=None)


if __name__ == "__main__":
    main()
