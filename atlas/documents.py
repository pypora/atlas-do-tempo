"""HTML and search normalization at the document boundary."""

import re
import unicodedata
from html.parser import HTMLParser

import nh3

ALLOWED_TAGS = {
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "h3",
    "ul",
    "ol",
    "li",
    "blockquote",
    "a",
    "img",
}
IMAGE_URL = re.compile(r"data:image/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+\Z", re.I)
HTTP_URL = re.compile(r"https?://\S+\Z", re.I)


def _attribute(tag: str, attribute: str, value: str) -> str | None:
    if tag == "a" and attribute == "href" and HTTP_URL.fullmatch(value):
        return value
    if (
        tag == "img"
        and attribute == "src"
        and len(value) <= 8_000_000
        and IMAGE_URL.fullmatch(value)
    ):
        return value
    if tag == "img" and attribute == "alt":
        return value[:120]
    return None


_CLEANER = nh3.Cleaner(
    tags=ALLOWED_TAGS,
    clean_content_tags={"script", "style", "iframe", "object", "svg", "math"},
    attributes={"a": {"href"}, "img": {"src", "alt"}},
    attribute_filter=_attribute,
    url_schemes={"http", "https", "data"},
    url_relative="deny",
    link_rel="noopener noreferrer",
)


class _Text(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)


def clean_document(source: str) -> tuple[str, str]:
    """Return safe HTML and its searchable plain text."""
    body = _CLEANER.clean(source)
    parser = _Text()
    parser.feed(body)
    return body, " ".join(" ".join(parser.parts).split())


def normalize_search(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value.casefold())
    return "".join(char for char in decomposed if not unicodedata.combining(char))


def searchable_text(title: str, summary: str, body_text: str) -> str:
    return normalize_search(" ".join((title, summary, body_text)))


def search_terms(query: str) -> list[str]:
    return re.findall(r"[^\W_]+", normalize_search(query))[:8]
