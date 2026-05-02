from __future__ import annotations

from base64 import b64decode, b64encode


def simple_obfuscate(value: str) -> str:
    return b64encode(value.encode("utf-8")).decode("utf-8")


def simple_deobfuscate(value: str) -> str:
    return b64decode(value.encode("utf-8")).decode("utf-8")
