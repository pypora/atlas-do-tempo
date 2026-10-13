from atlas.documents import clean_document, search_terms
from atlas.schemas import EventInput


def test_sanitizer_removes_active_content_and_keeps_safe_formatting():
    html, plain = clean_document(
        "<p>Olá <strong>mundo</strong><script>alert(1)</script>"
        '<a href="javascript:alert(2)">ruim</a>'
        '<a href="https://example.org/">bom</a>'
        '<img src="data:text/html;base64,abc" onerror="alert(3)">'
        '<img src="data:image/png;base64,aGVsbG8=" alt="Teste"></p>'
    )
    assert "<script" not in html and "alert" not in html
    assert "javascript:" not in html and "onerror" not in html
    assert 'href="https://example.org/"' in html
    assert "data:text/html" not in html
    assert "data:image/png;base64,aGVsbG8=" in html
    assert plain == "Olá mundo ruim bom"


def test_search_ignores_accents_and_date_conversion():
    assert search_terms("Pré-história, DINOSSÁUROS!") == ["pre", "historia", "dinossauros"]
    item = EventInput(title="Exemplo", dateMode="bce", dateValue=1)
    assert item.bp >= 2025
