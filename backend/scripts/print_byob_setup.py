from __future__ import annotations

import platform


def main() -> None:
    system = platform.system().lower()
    if system == "windows":
        command = r"chrome.exe --remote-debugging-port=9222 --user-data-dir=C:\ChromeCDP"
    elif system == "darwin":
        command = 'open -a "Google Chrome" --args --remote-debugging-port=9222'
    else:
        command = "google-chrome --remote-debugging-port=9222"

    print("Launch Chrome with remote debugging before BYOB scraping:")
    print(command)


if __name__ == "__main__":
    main()