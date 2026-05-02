from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

try:
    from playwright.async_api import TimeoutError as PlaywrightTimeoutError
    from playwright.async_api import async_playwright
except ModuleNotFoundError:  # pragma: no cover - depends on local optional deps
    async_playwright = None
    PlaywrightTimeoutError = TimeoutError

from datareaper.core.config import get_settings
from datareaper.core.logging import get_logger

DEFAULT_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/123.0.0.0 Safari/537.36"
)

SPA_HOSTS = {
    "reddit.com",
    "www.reddit.com",
    "linkedin.com",
    "www.linkedin.com",
    "twitter.com",
    "www.twitter.com",
    "x.com",
    "www.x.com",
    "youtube.com",
    "www.youtube.com",
    "tiktok.com",
    "www.tiktok.com",
}

SPA_SELECTORS = {
    "reddit.com": "shreddit-post, .Post, h1",
    "linkedin.com": "h1.text-heading-xlarge, .profile-topcard",
    "x.com": "article, [data-testid='primaryColumn']",
    "twitter.com": "article, [data-testid='primaryColumn']",
    "youtube.com": "ytd-channel-name, #channel-name",
}

STEALTH_SCRIPT = """
Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
Object.defineProperty(navigator, 'plugins', {get: () => [1,2,3,4,5]});
Object.defineProperty(navigator, 'languages', {get: () => ['en-US','en']});
const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
HTMLCanvasElement.prototype.toDataURL = function(type) {
    const shift = {r:-1, g:1, b:-1};
    const ctx = this.getContext('2d');
    if (ctx) {
        const img = ctx.getImageData(0, 0, this.width, this.height);
        for (let i = 0; i < img.data.length; i += 4) {
            img.data[i] = Math.max(0, img.data[i] + (shift.r || 0));
            img.data[i+1] = Math.max(0, img.data[i+1] + (shift.g || 0));
            img.data[i+2] = Math.max(0, img.data[i+2] + (shift.b || 0));
        }
        ctx.putImageData(img, 0, 0);
    }
    return origToDataURL.apply(this, arguments);
};
"""

logger = get_logger(__name__)


class PlaywrightClient:
    def __init__(self) -> None:
        self._playwright = None
        self._browser: Any | None = None
        self._settings = get_settings()

    async def start(self) -> None:
        if self._browser is not None:
            return
        if async_playwright is None:
            raise RuntimeError(
                "playwright is not installed. Install optional browser dependencies before running OSINT browser tasks."
            )
        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(
            headless=self._settings.playwright_headless
        )

    async def stop(self) -> None:
        if self._browser is not None:
            await self._browser.close()
            self._browser = None
        if self._playwright is not None:
            await self._playwright.stop()
            self._playwright = None

    async def _ensure_browser(self) -> None:
        if self._browser is None:
            await self.start()

    async def _new_context(self, proxy: str | None = None, stealth: bool = True) -> Any:
        await self._ensure_browser()
        assert self._browser is not None
        context_kwargs: dict[str, Any] = {
            "user_agent": DEFAULT_UA,
            "viewport": {"width": 1366, "height": 768},
        }
        effective_proxy = proxy or self._settings.playwright_proxy_server or ""
        if effective_proxy:
            context_kwargs["proxy"] = {"server": effective_proxy}
        context = await self._browser.new_context(**context_kwargs)
        if stealth:
            await context.add_init_script(STEALTH_SCRIPT)
        return context

    async def fetch(
        self,
        url: str,
        wait_selector: str | None = None,
        proxy: str | None = None,
        stealth: bool = True,
    ) -> dict:
        context = await self._new_context(proxy=proxy, stealth=stealth)
        page = await context.new_page()
        try:
            host = urlparse(url).netloc.lower().replace("www.", "")
            matched_selector = next(
                (selector for key, selector in SPA_SELECTORS.items() if key in host),
                None,
            )

            # Keep navigation timeout lower so blocked social pages do not stall the crawl loop.
            nav_timeout_ms = 12000
            response = None
            timed_out = False
            try:
                # Always use domcontentloaded; networkidle can hang on SPAs with heartbeat polling.
                response = await page.goto(url, wait_until="domcontentloaded", timeout=nav_timeout_ms)
            except PlaywrightTimeoutError:
                timed_out = True
                logger.warning(
                    "playwright_navigation_timeout",
                    url=url,
                    timeout_ms=nav_timeout_ms,
                )

            effective_selector = wait_selector or matched_selector
            if effective_selector:
                try:
                    await page.wait_for_selector(effective_selector, timeout=6000, state="attached")
                except Exception:
                    # Best-effort only; we still return what we have.
                    pass
            try:
                html = await page.content()
            except Exception:
                # Some anti-bot flows trigger a mid-navigation state; wait once and retry.
                await page.wait_for_timeout(1200)
                html = await page.content()
            status = response.status if response is not None else 0
            return {
                "url": url,
                "final_url": page.url or url,
                "html": html,
                "status": status,
                "timed_out": timed_out,
            }
        except Exception as exc:  # pragma: no cover - browser/network exceptions
            logger.warning("playwright_fetch_failed", url=url, error=str(exc))
            return {"url": url, "final_url": url, "html": "", "status": 0, "error": str(exc)}
        finally:
            await context.close()

    async def fill_form_and_submit(
        self,
        url: str,
        field_map: dict[str, str],
        submit_selector: str,
    ) -> bool:
        context = await self._new_context()
        page = await context.new_page()
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=45000)
            for selector, value in field_map.items():
                await page.fill(selector, value)
            await page.click(submit_selector)
            await page.wait_for_load_state("networkidle", timeout=20000)
            return True
        except Exception as exc:  # pragma: no cover - browser/network exceptions
            logger.warning("playwright_form_submit_failed", url=url, error=str(exc))
            return False
        finally:
            await context.close()

    async def capture_screenshot(self, url: str, full_page: bool = True) -> bytes:
        context = await self._new_context()
        page = await context.new_page()
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=45000)
            return await page.screenshot(type="png", full_page=full_page)
        except Exception as exc:  # pragma: no cover - browser/network exceptions
            logger.warning("playwright_screenshot_failed", url=url, error=str(exc))
            return b""
        finally:
            await context.close()
