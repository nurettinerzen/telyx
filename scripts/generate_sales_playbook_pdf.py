#!/usr/bin/env python3

from __future__ import annotations

import re
import sys
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "kb-docs" / "telyx-sales-playbook-tr.md"
DEFAULT_OUTPUT = ROOT / "kb-docs" / "telyx-sales-playbook-tr.pdf"


def register_fonts() -> tuple[str, str, str]:
    font_candidates = [
        (
            Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
            Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
            Path("/System/Library/Fonts/Supplemental/Arial Italic.ttf"),
        ),
        (
            Path("/Library/Fonts/Arial Unicode.ttf"),
            Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
            Path("/System/Library/Fonts/Supplemental/Arial Italic.ttf"),
        ),
    ]

    for regular, bold, italic in font_candidates:
        if regular.exists() and bold.exists() and italic.exists():
            pdfmetrics.registerFont(TTFont("TelyxBody", str(regular)))
            pdfmetrics.registerFont(TTFont("TelyxBold", str(bold)))
            pdfmetrics.registerFont(TTFont("TelyxItalic", str(italic)))
            return "TelyxBody", "TelyxBold", "TelyxItalic"

    raise RuntimeError("Uygun TrueType font bulunamadı; PDF üretimi yapılamadı.")


def build_styles(body_font: str, bold_font: str, italic_font: str):
    styles = getSampleStyleSheet()

    title = ParagraphStyle(
        "TelyxTitle",
        parent=styles["Title"],
        fontName=bold_font,
        fontSize=22,
        leading=27,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#0B1F44"),
        spaceAfter=10,
    )
    subtitle = ParagraphStyle(
        "TelyxSubtitle",
        parent=styles["BodyText"],
        fontName=body_font,
        fontSize=10.5,
        leading=14,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#4A5568"),
        spaceAfter=14,
    )
    h1 = ParagraphStyle(
        "TelyxH1",
        parent=styles["Heading1"],
        fontName=bold_font,
        fontSize=16,
        leading=20,
        textColor=colors.HexColor("#0B1F44"),
        spaceBefore=8,
        spaceAfter=8,
    )
    h2 = ParagraphStyle(
        "TelyxH2",
        parent=styles["Heading2"],
        fontName=bold_font,
        fontSize=13,
        leading=17,
        textColor=colors.HexColor("#123B7A"),
        spaceBefore=6,
        spaceAfter=5,
    )
    body = ParagraphStyle(
        "TelyxBody",
        parent=styles["BodyText"],
        fontName=body_font,
        fontSize=10.5,
        leading=15,
        alignment=TA_LEFT,
        textColor=colors.HexColor("#1A202C"),
        spaceAfter=6,
    )
    bullet = ParagraphStyle(
        "TelyxBullet",
        parent=body,
        leftIndent=8,
        firstLineIndent=0,
        bulletIndent=0,
        spaceAfter=2,
    )
    number = ParagraphStyle(
        "TelyxNumber",
        parent=body,
        leftIndent=4,
        firstLineIndent=0,
        spaceAfter=2,
    )
    quote = ParagraphStyle(
        "TelyxQuote",
        parent=body,
        fontName=italic_font,
        textColor=colors.HexColor("#2D3748"),
        leftIndent=10,
        borderPadding=6,
        borderWidth=0.6,
        borderColor=colors.HexColor("#CBD5E0"),
        borderLeft=True,
        backColor=colors.HexColor("#F8FAFC"),
        spaceBefore=3,
        spaceAfter=8,
    )
    return {
        "title": title,
        "subtitle": subtitle,
        "h1": h1,
        "h2": h2,
        "body": body,
        "bullet": bullet,
        "number": number,
        "quote": quote,
    }


def inline_markup(text: str) -> str:
    text = escape(text.strip())
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"`(.+?)`", r"<font color='#0F4C81'>\1</font>", text)
    return text.replace("\n", "<br/>")


def add_list(story, items, styles, ordered=False):
    if not items:
        return
    style = styles["number"] if ordered else styles["bullet"]
    for index, item in enumerate(items, start=1):
        prefix = f"{index}. " if ordered else "- "
        story.append(Paragraph(inline_markup(prefix + item), style))
    story.append(Spacer(1, 3))


def parse_markdown_to_story(text: str, styles):
    story = []
    bullet_items: list[str] = []
    numbered_items: list[str] = []

    def flush_lists():
        nonlocal bullet_items, numbered_items
        if bullet_items:
            add_list(story, bullet_items, styles, ordered=False)
            bullet_items = []
        if numbered_items:
            add_list(story, numbered_items, styles, ordered=True)
            numbered_items = []

    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()

        if not stripped:
            flush_lists()
            story.append(Spacer(1, 3))
            continue

        if stripped.startswith("# "):
            flush_lists()
            story.append(Paragraph(inline_markup(stripped[2:]), styles["title"]))
            continue

        if stripped.startswith("## "):
            flush_lists()
            story.append(Paragraph(inline_markup(stripped[3:]), styles["h1"]))
            continue

        if stripped.startswith("### "):
            flush_lists()
            story.append(Paragraph(inline_markup(stripped[4:]), styles["h2"]))
            continue

        if stripped.startswith("- "):
            bullet_items.append(stripped[2:].strip())
            continue

        if re.match(r"^\d+\.\s+", stripped):
            numbered_items.append(re.sub(r"^\d+\.\s+", "", stripped))
            continue

        flush_lists()

        if stripped.endswith(":") and len(stripped) < 90:
            story.append(Paragraph(inline_markup(stripped), styles["h2"]))
            continue

        story.append(Paragraph(inline_markup(stripped), styles["body"]))

    flush_lists()
    return story


def add_page_number(canvas, doc):
    canvas.saveState()
    canvas.setFont("TelyxBody", 8)
    canvas.setFillColor(colors.HexColor("#718096"))
    canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Sayfa {doc.page}")
    canvas.restoreState()


def build_pdf(input_path: Path, output_path: Path):
    body_font, bold_font, italic_font = register_fonts()
    styles = build_styles(body_font, bold_font, italic_font)
    markdown = input_path.read_text(encoding="utf-8")
    markdown = re.sub(r"^# .+\n\s*", "", markdown, count=1)

    story = [
        Paragraph("Telyx Satış Rehberi ve Bilgi Bankası", styles["title"]),
        Paragraph(
            "Junior satış temsilcileri, satış asistanları ve müşteri görüşmelerinde kullanılmak üzere hazırlanmıştır.",
            styles["subtitle"],
        ),
        Spacer(1, 6),
    ]
    story.extend(parse_markdown_to_story(markdown, styles))

    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=16 * mm,
        title="Telyx Satış Rehberi ve Bilgi Bankası",
        author="Codex",
    )
    doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)


def main():
    input_path = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_INPUT
    output_path = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else DEFAULT_OUTPUT

    if not input_path.exists():
        raise SystemExit(f"Girdi bulunamadı: {input_path}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    build_pdf(input_path, output_path)
    print(output_path)


if __name__ == "__main__":
    main()
