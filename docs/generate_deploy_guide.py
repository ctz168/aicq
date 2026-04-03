#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AICQ Deployment Guide PDF Generator
Generates a comprehensive deployment guide in Chinese with 3 major sections.
"""

import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
    Table, TableStyle, PageBreak, KeepTogether, NextPageTemplate,
    Flowable
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

# ============================================================
# Font Registration
# ============================================================
FONT_DIR_CHINESE = "/usr/share/fonts/truetype/chinese"
FONT_DIR_ENGLISH = "/usr/share/fonts/truetype/english"
FONT_DIR_DEJAVU = "/usr/share/fonts/truetype/dejavu"

pdfmetrics.registerFont(TTFont("SimHei", os.path.join(FONT_DIR_CHINESE, "SimHei.ttf")))
pdfmetrics.registerFont(TTFont("TimesNewRoman", os.path.join(FONT_DIR_ENGLISH, "Times-New-Roman.ttf")))
pdfmetrics.registerFont(TTFont("DejaVuSans", os.path.join(FONT_DIR_DEJAVU, "DejaVuSans.ttf")))
pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", os.path.join(FONT_DIR_DEJAVU, "DejaVuSans-Bold.ttf")))
pdfmetrics.registerFont(TTFont("DejaVuSansMono", os.path.join(FONT_DIR_DEJAVU, "DejaVuSansMono.ttf")))

registerFontFamily(
    "SimHei",
    normal="SimHei",
    bold="SimHei",
    italic="SimHei",
    boldItalic="SimHei"
)
registerFontFamily(
    "TimesNewRoman",
    normal="TimesNewRoman",
    bold="TimesNewRoman",
    italic="TimesNewRoman",
    boldItalic="TimesNewRoman"
)
registerFontFamily(
    "DejaVuSans",
    normal="DejaVuSans",
    bold="DejaVuSans-Bold",
    italic="DejaVuSans",
    boldItalic="DejaVuSans-Bold"
)

# ============================================================
# Color Palette - "Midnight Code"
# ============================================================
COLOR_PRIMARY = HexColor("#020617")       # Midnight Black - Titles
COLOR_BODY = HexColor("#1E293B")          # Deep Slate Blue - Body Text
COLOR_SECONDARY = HexColor("#64748B")     # Cool Blue-Gray - Subtitles
COLOR_ACCENT = HexColor("#94A3B8")        # Steady Silver - UI/Decor
COLOR_TABLE_BG = HexColor("#F8FAFC")      # Glacial Blue-White - Table/Background
COLOR_TABLE_HEADER = HexColor("#1F4E79")  # Table header background
COLOR_CODE_BG = HexColor("#F1F5F9")       # Code block background
COLOR_COVER_LINE = HexColor("#334155")    # Cover decorative line
COLOR_TOC_H1 = HexColor("#1E293B")       # TOC heading 1
COLOR_TOC_H2 = HexColor("#475569")       # TOC heading 2
COLOR_WHITE = white
COLOR_BLACK = black

# ============================================================
# Page dimensions
# ============================================================
PAGE_W, PAGE_H = A4
LEFT_MARGIN = 25 * mm
RIGHT_MARGIN = 25 * mm
TOP_MARGIN = 25 * mm
BOTTOM_MARGIN = 25 * mm
CONTENT_W = PAGE_W - LEFT_MARGIN - RIGHT_MARGIN

# ============================================================
# Custom Styles
# ============================================================
styles = getSampleStyleSheet()

style_body = ParagraphStyle(
    "BodyCN",
    parent=styles["Normal"],
    fontName="SimHei",
    fontSize=10,
    leading=16,
    textColor=COLOR_BODY,
    alignment=TA_LEFT,
    wordWrap="CJK",
    spaceBefore=2,
    spaceAfter=4,
)

style_h1 = ParagraphStyle(
    "H1CN",
    parent=styles["Heading1"],
    fontName="SimHei",
    fontSize=20,
    leading=28,
    textColor=COLOR_PRIMARY,
    spaceBefore=20,
    spaceAfter=10,
    alignment=TA_LEFT,
    wordWrap="CJK",
)

style_h2 = ParagraphStyle(
    "H2CN",
    parent=styles["Heading2"],
    fontName="SimHei",
    fontSize=14,
    leading=20,
    textColor=COLOR_PRIMARY,
    spaceBefore=14,
    spaceAfter=6,
    alignment=TA_LEFT,
    wordWrap="CJK",
)

style_h3 = ParagraphStyle(
    "H3CN",
    parent=styles["Heading3"],
    fontName="SimHei",
    fontSize=11,
    leading=16,
    textColor=COLOR_PRIMARY,
    spaceBefore=8,
    spaceAfter=4,
    alignment=TA_LEFT,
    wordWrap="CJK",
)

style_bullet = ParagraphStyle(
    "BulletCN",
    parent=style_body,
    leftIndent=18,
    firstLineIndent=0,
    bulletIndent=6,
    spaceBefore=1,
    spaceAfter=1,
)

style_code = ParagraphStyle(
    "CodeBlock",
    parent=styles["Normal"],
    fontName="DejaVuSansMono",
    fontSize=8,
    leading=11,
    textColor=COLOR_BODY,
    backColor=COLOR_CODE_BG,
    leftIndent=6,
    rightIndent=6,
    spaceBefore=4,
    spaceAfter=6,
)

style_note = ParagraphStyle(
    "NoteCN",
    parent=style_body,
    fontName="SimHei",
    fontSize=9,
    leading=14,
    textColor=COLOR_SECONDARY,
    leftIndent=12,
    spaceBefore=4,
    spaceAfter=4,
)

# ============================================================
# Helper: Code Block as a Table
# ============================================================
def make_code_block(code_text):
    """Create a styled code block using a table with light gray background."""
    lines = code_text.strip().split("\n")
    formatted = "<br/>".join(
        line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        for line in lines
    )
    p = Paragraph(formatted, style_code)
    t = Table([[p]], colWidths=[CONTENT_W - 4])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), COLOR_CODE_BG),
        ("BOX", (0, 0), (-1, -1), 0.5, COLOR_ACCENT),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t

# ============================================================
# Helper: Styled Table
# ============================================================
def make_table(headers, rows, col_widths=None):
    """Create a styled data table with dark blue header."""
    data = [headers] + rows
    if col_widths is None:
        col_widths = [CONTENT_W / len(headers)] * len(headers)

    styled_data = []
    # Header row
    styled_data.append([
        Paragraph(str(h), ParagraphStyle(
            "TH", fontName="SimHei", fontSize=9, leading=13,
            textColor=COLOR_WHITE, alignment=TA_CENTER, wordWrap="CJK",
        )) for h in headers
    ])
    # Data rows
    for row in rows:
        styled_data.append([
            Paragraph(str(cell), ParagraphStyle(
                "TD", fontName="SimHei", fontSize=8.5, leading=12,
                textColor=COLOR_BODY, alignment=TA_LEFT, wordWrap="CJK",
            )) for cell in row
        ])

    t = Table(styled_data, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), COLOR_TABLE_HEADER),
        ("TEXTCOLOR", (0, 0), (-1, 0), COLOR_WHITE),
        ("FONTNAME", (0, 0), (-1, 0), "SimHei"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
        ("TOPPADDING", (0, 0), (-1, 0), 6),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 5),
        ("TOPPADDING", (0, 1), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("GRID", (0, 0), (-1, -1), 0.5, COLOR_ACCENT),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]
    # Alternating row colors
    for i in range(1, len(data)):
        if i % 2 == 0:
            style_cmds.append(("BACKGROUND", (0, i), (-1, i), COLOR_TABLE_BG))
    t.setStyle(TableStyle(style_cmds))
    return t

# ============================================================
# Helper: Bullet list
# ============================================================
def make_bullet(text, indent=0):
    bullet_char = "\u2022"
    style = ParagraphStyle(
        "BulletDyn",
        parent=style_body,
        leftIndent=18 + indent * 12,
        firstLineIndent=0,
        bulletIndent=6 + indent * 12,
        spaceBefore=1,
        spaceAfter=1,
    )
    return Paragraph(f"{bullet_char}  {text}", style)

def make_numbered(num, text, indent=0):
    style = ParagraphStyle(
        "NumberedDyn",
        parent=style_body,
        leftIndent=18 + indent * 12,
        firstLineIndent=0,
        bulletIndent=6 + indent * 12,
        spaceBefore=1,
        spaceAfter=1,
    )
    return Paragraph(f"{num}.  {text}", style)

# ============================================================
# Section helpers
# ============================================================
def section_h1(key, text):
    """H1 with TOC bookmark."""
    return Paragraph(f'<bookmark level="0" title="{text}"/><a name="{key}"/>{text}', style_h1)

def section_h2(key, text):
    """H2 with TOC bookmark."""
    return Paragraph(f'<bookmark level="1" title="{text}"/><a name="{key}"/>{text}', style_h2)

def section_h3(text):
    return Paragraph(text, style_h3)

def body_text(text):
    return Paragraph(text, style_body)

def spacer(h=6):
    return Spacer(1, h)

# ============================================================
# Page Number Callbacks
# ============================================================
def cover_page_template(canvas, doc):
    """Draw nothing for cover page - content is handled by flowables."""
    pass

def toc_page_template(canvas, doc):
    """Header/footer for TOC page."""
    canvas.saveState()
    # Header line
    canvas.setStrokeColor(COLOR_ACCENT)
    canvas.setLineWidth(0.5)
    canvas.line(LEFT_MARGIN, PAGE_H - TOP_MARGIN + 5*mm, PAGE_W - RIGHT_MARGIN, PAGE_H - TOP_MARGIN + 5*mm)
    # Page number
    canvas.setFont("TimesNewRoman", 9)
    canvas.setFillColor(COLOR_SECONDARY)
    canvas.drawCentredString(PAGE_W / 2, BOTTOM_MARGIN - 10*mm, f"- {doc.page} -")
    canvas.restoreState()

def content_page_template(canvas, doc):
    """Header/footer for content pages."""
    canvas.saveState()
    # Header line
    canvas.setStrokeColor(COLOR_ACCENT)
    canvas.setLineWidth(0.5)
    canvas.line(LEFT_MARGIN, PAGE_H - TOP_MARGIN + 5*mm, PAGE_W - RIGHT_MARGIN, PAGE_H - TOP_MARGIN + 5*mm)
    # Header text
    canvas.setFont("SimHei", 8)
    canvas.setFillColor(COLOR_SECONDARY)
    canvas.drawString(LEFT_MARGIN, PAGE_H - TOP_MARGIN + 8*mm, "AICQ \u90e8\u7f72\u6307\u5357")
    canvas.drawRightString(PAGE_W - RIGHT_MARGIN, PAGE_H - TOP_MARGIN + 8*mm, "v1.0")
    # Footer line
    canvas.setStrokeColor(COLOR_ACCENT)
    canvas.line(LEFT_MARGIN, BOTTOM_MARGIN - 5*mm, PAGE_W - RIGHT_MARGIN, BOTTOM_MARGIN - 5*mm)
    # Page number
    canvas.setFont("TimesNewRoman", 9)
    canvas.setFillColor(COLOR_SECONDARY)
    canvas.drawCentredString(PAGE_W / 2, BOTTOM_MARGIN - 12*mm, f"- {doc.page} -")
    canvas.restoreState()


# ============================================================
# Cover Page Flowable
# ============================================================
class CoverPageFlowable(Flowable):
    """Custom flowable that draws the cover page."""
    def __init__(self):
        Flowable.__init__(self)
        self.width = CONTENT_W
        self.height = PAGE_H - TOP_MARGIN - BOTTOM_MARGIN

    def draw(self):
        c = self.canv
        cx = self.width / 2

        # Decorative top line
        c.setStrokeColor(COLOR_PRIMARY)
        c.setLineWidth(2)
        c.line(cx - 60*mm, self.height - 20*mm, cx + 60*mm, self.height - 20*mm)

        # Spacer
        y = self.height - 55*mm

        # Main title
        c.setFont("SimHei", 36)
        c.setFillColor(COLOR_PRIMARY)
        c.drawCentredString(cx, y, "AICQ \u90e8\u7f72\u6307\u5357")

        # Decorative line under title
        y -= 12*mm
        c.setStrokeColor(COLOR_COVER_LINE)
        c.setLineWidth(1)
        c.line(cx - 40*mm, y, cx + 40*mm, y)

        # Subtitle
        y -= 15*mm
        c.setFont("SimHei", 14)
        c.setFillColor(COLOR_SECONDARY)
        c.drawCentredString(cx, y, "\u670d\u52a1\u5668 \u00b7 \u63d2\u4ef6 \u00b7 \u5ba2\u6237\u7aef  \u4e09\u5927\u677f\u5757\u72ec\u7acb\u90e8\u7f72\u624b\u518c")

        # Version info
        y -= 12*mm
        c.setFont("TimesNewRoman", 11)
        c.setFillColor(COLOR_ACCENT)
        c.drawCentredString(cx, y, "AICQ Deployment Guide  v1.0")

        # Feature tags
        y -= 20*mm
        tags = ["\u96f6\u77e5\u8bc6\u67b6\u6784", "\u7aef\u5230\u7aef\u52a0\u5bc6", "P2P \u901a\u4fe1", "WebSocket \u4e2d\u7ee7", "\u65ad\u70b9\u7eed\u4f20"]
        tag_width = 28*mm
        total_w = len(tags) * tag_width + (len(tags) - 1) * 5*mm
        start_x = cx - total_w / 2
        c.setFont("SimHei", 8)
        for i, tag in enumerate(tags):
            tx = start_x + i * (tag_width + 5*mm)
            c.setFillColor(COLOR_TABLE_BG)
            c.roundRect(tx, y - 2*mm, tag_width, 7*mm, 2*mm, fill=1, stroke=0)
            c.setStrokeColor(COLOR_ACCENT)
            c.setLineWidth(0.5)
            c.roundRect(tx, y - 2*mm, tag_width, 7*mm, 2*mm, fill=0, stroke=1)
            c.setFillColor(COLOR_SECONDARY)
            c.drawCentredString(tx + tag_width / 2, y - 0.3*mm, tag)

        # Bottom decorative line
        y = 25*mm
        c.setStrokeColor(COLOR_PRIMARY)
        c.setLineWidth(2)
        c.line(cx - 60*mm, y, cx + 60*mm, y)

        # Author
        y -= 10*mm
        c.setFont("TimesNewRoman", 10)
        c.setFillColor(COLOR_SECONDARY)
        c.drawCentredString(cx, y, "Generated by Z.ai")


# ============================================================
# TOC Template
# ============================================================
class TocDocTemplate(BaseDocTemplate):
    """Custom DocTemplate that supports multiBuild for TOC."""
    def __init__(self, filename, **kwargs):
        BaseDocTemplate.__init__(self, filename, **kwargs)
        self.page_count_offset = 0

    def afterFlowable(self, flowable):
        """Register TOC entries."""
        if isinstance(flowable, Paragraph):
            style = flowable.style.name
            text = flowable.getPlainText()
            if style == "H1CN":
                key = flowable._bookmarkName if hasattr(flowable, "_bookmarkName") else text
                self.canv.bookmarkPage(key)
                self.notify("TOCEntry", (0, text, self.page, key))
            elif style == "H2CN":
                key = flowable._bookmarkName if hasattr(flowable, "_bookmarkName") else text
                self.canv.bookmarkPage(key)
                self.notify("TOCEntry", (1, text, self.page, key))


# Override section_h1 and section_h2 to store bookmark names
_original_h1 = section_h1
_original_h2 = section_h2

def section_h1(key, text):
    p = Paragraph(f'<bookmark level="0" title="{text}"/><a name="{key}"/>{text}', style_h1)
    p._bookmarkName = key
    return p

def section_h2(key, text):
    p = Paragraph(f'<bookmark level="1" title="{text}"/><a name="{key}"/>{text}', style_h2)
    p._bookmarkName = key
    return p


# ============================================================
# Build Document
# ============================================================
def build_pdf(output_path):
    """Build the complete PDF document."""

    # --- Frames ---
    cover_frame = Frame(LEFT_MARGIN, BOTTOM_MARGIN, CONTENT_W, PAGE_H - TOP_MARGIN - BOTTOM_MARGIN, id="cover")
    toc_frame = Frame(LEFT_MARGIN, BOTTOM_MARGIN, CONTENT_W, PAGE_H - TOP_MARGIN - BOTTOM_MARGIN, id="toc")
    content_frame = Frame(LEFT_MARGIN, BOTTOM_MARGIN, CONTENT_W, PAGE_H - TOP_MARGIN - BOTTOM_MARGIN, id="content")

    # --- Page Templates ---
    cover_template = PageTemplate(id="Cover", frames=[cover_frame], onPage=cover_page_template)
    toc_template = PageTemplate(id="TOC", frames=[toc_frame], onPage=toc_page_template)
    content_template = PageTemplate(id="Content", frames=[content_frame], onPage=content_page_template)

    # --- Document ---
    doc = TocDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=LEFT_MARGIN,
        rightMargin=RIGHT_MARGIN,
        topMargin=TOP_MARGIN,
        bottomMargin=BOTTOM_MARGIN,
        title="AICQ_Deployment_Guide",
        author="Z.ai",
        creator="Z.ai",
    )
    doc.addPageTemplates([cover_template, toc_template, content_template])

    # --- TOC ---
    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle(
            "TOC1",
            fontName="SimHei",
            fontSize=12,
            leading=20,
            leftIndent=10,
            textColor=COLOR_TOC_H1,
            spaceBefore=6,
            spaceAfter=2,
            wordWrap="CJK",
        ),
        ParagraphStyle(
            "TOC2",
            fontName="SimHei",
            fontSize=10,
            leading=16,
            leftIndent=28,
            textColor=COLOR_TOC_H2,
            spaceBefore=2,
            spaceAfter=1,
            wordWrap="CJK",
        ),
    ]

    # ============================================================
    # Story Assembly
    # ============================================================
    story = []

    # --- Cover Page ---
    story.append(CoverPageFlowable())
    story.append(NextPageTemplate("TOC"))
    story.append(PageBreak())

    # --- TOC Page ---
    story.append(Paragraph("\u76ee\u5f55", ParagraphStyle(
        "TOCTitle", fontName="SimHei", fontSize=22, leading=30,
        textColor=COLOR_PRIMARY, alignment=TA_LEFT, spaceAfter=12,
    )))
    story.append(toc)
    story.append(NextPageTemplate("Content"))
    story.append(PageBreak())

    # ============================================================
    # SECTION 1: AICQ Server 部署
    # ============================================================
    story.append(section_h1("sec1", "\u7b2c\u4e00\u7ae0  AICQ Server \u90e8\u7f72"))
    story.append(spacer(4))

    # 1.1 概述
    story.append(section_h2("sec1_1", "1.1  \u6982\u8ff0"))
    story.append(body_text("AICQ Server \u662f\u57fa\u4e8e Node.js/Express + WebSocket \u7684\u4e2d\u7ee7\u670d\u52a1\u5668\uff0c\u662f\u6574\u4e2a AICQ \u901a\u4fe1\u7cfb\u7edf\u7684\u6838\u5fc3\u7ec4\u4ef6\u3002\u670d\u52a1\u5668\u8d1f\u8d23\u4ee5\u4e0b\u5173\u952e\u529f\u80fd\uff1a"))
    story.append(make_bullet("\u8282\u70b9\u6ce8\u518c\u4e0e\u7ba1\u7406"))
    story.append(make_bullet("\u4e34\u65f6\u53f7\u7801\u5206\u914d\uff086\u4f4d\u6570\u5b57\uff09"))
    story.append(make_bullet("\u63e1\u624b\u534f\u8c03\uff08\u52a0\u5bc6\u534f\u5546\uff09"))
    story.append(make_bullet("P2P \u4fe1\u4ee4\u4e2d\u7ee7"))
    story.append(make_bullet("\u6587\u4ef6\u4f20\u8f93\u534f\u8c03"))
    story.append(spacer(4))
    story.append(body_text("\u5728\u96f6\u77e5\u8bc6\u67b6\u6784\u4e0b\uff0c\u670d\u52a1\u5668\u4e0d\u5b58\u50a8\u4efb\u4f55\u6d88\u606f\u5185\u5bb9\uff0c\u4e0d\u6301\u6709\u7528\u6237\u79c1\u94a5\uff0c\u786e\u4fdd\u901a\u4fe1\u7684\u5b8c\u5168\u9690\u79c1\u4fdd\u62a4\u3002"))
    story.append(spacer(2))
    story.append(body_text("<b>\u6280\u672f\u6808\uff1a</b>Express 4.18\u3001ws 8.16\u3001TypeScript 5.3\u3001Node.js \u2265 18"))
    story.append(spacer(6))

    # 1.2 系统要求
    story.append(section_h2("sec1_2", "1.2  \u7cfb\u7edf\u8981\u6c42"))
    story.append(spacer(2))
    story.append(make_table(
        ["\u9879\u76ee", "\u6700\u4f4e\u914d\u7f6e", "\u63a8\u8350\u914d\u7f6e"],
        [
            ["CPU", "1\u6838", "2\u6838"],
            ["\u5185\u5b58", "512MB", "2GB"],
            ["\u786c\u76d8", "10GB SSD", "50GB SSD"],
            ["\u64cd\u4f5c\u7cfb\u7edf", "Ubuntu 20.04 / CentOS 8", "Ubuntu 22.04 LTS"],
            ["Node.js", "18.x LTS", "20.x LTS"],
            ["\u7f51\u7edc", "\u516c\u7f51IP + \u57df\u540d", "\u516c\u7f51IP + \u57df\u540d + SSL\u8bc1\u4e66"],
        ],
        col_widths=[CONTENT_W * 0.25, CONTENT_W * 0.35, CONTENT_W * 0.40],
    ))
    story.append(spacer(8))

    # 1.3 环境准备
    story.append(section_h2("sec1_3", "1.3  \u73af\u5883\u51c6\u5907"))
    story.append(body_text("\u4ee5\u4e0b\u547d\u4ee4\u7528\u4e8e\u5728 Ubuntu \u7cfb\u7edf\u4e0a\u5b89\u88c5 Node.js 20.x \u53ca PM2 \u8fdb\u7a0b\u7ba1\u7406\u5668\uff1a"))
    story.append(make_code_block("""# \u5b89\u88c5 Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v && npm -v

# \u5b89\u88c5 PM2 \u8fdb\u7a0b\u7ba1\u7406\u5668\uff08\u63a8\u8350\u751f\u4ea7\u73af\u5883\u4f7f\u7528\uff09
sudo npm install -g pm2"""))
    story.append(spacer(8))

    # 1.4 获取源码
    story.append(section_h2("sec1_4", "1.4  \u83b7\u53d6\u6e90\u7801"))
    story.append(make_code_block("""git clone https://github.com/ctz168/aicq.git
cd aicq"""))
    story.append(spacer(8))

    # 1.5 安装依赖
    story.append(section_h2("sec1_5", "1.5  \u5b89\u88c5\u4f9d\u8d56"))
    story.append(body_text("\u5206\u522b\u5b89\u88c5\u52a0\u5bc6\u5e93\u548c\u670d\u52a1\u5668\u7684\u4f9d\u8d56\uff1a"))
    story.append(make_code_block("""cd aicq-crypto && npm install
cd ../aicq-server && npm install"""))
    story.append(spacer(8))

    # 1.6 配置
    story.append(section_h2("sec1_6", "1.6  \u914d\u7f6e"))
    story.append(body_text("\u5728 aicq-server \u76ee\u5f55\u4e0b\u590d\u5236\u73af\u5883\u914d\u7f6e\u6a21\u677f\u5e76\u6309\u9700\u4fee\u6539\uff1a"))
    story.append(make_code_block("""cd aicq-server
cp .env.example .env
# \u7f16\u8f91 .env \u6309\u9700\u4fee\u6539\u914d\u7f6e
nano .env"""))
    story.append(spacer(4))
    story.append(body_text("<b>\u914d\u7f6e\u53d8\u91cf\u8bf4\u660e\uff1a</b>"))
    story.append(spacer(2))
    story.append(make_table(
        ["\u53d8\u91cf\u540d", "\u9ed8\u8ba4\u503c", "\u8bf4\u660e"],
        [
            ["PORT", "3000", "\u670d\u52a1\u76d1\u542c\u7aef\u53e3"],
            ["DOMAIN", "aicq.online", "\u670d\u52a1\u5668\u57df\u540d"],
            ["MAX_FRIENDS", "200", "\u6bcf\u8282\u70b9\u6700\u5927\u597d\u53cb\u6570"],
            ["TEMP_NUMBER_TTL_HOURS", "24", "\u4e34\u65f6\u53f7\u7801\u6709\u6548\u671f\uff08\u5c0f\u65f6\uff09"],
            ["QR_CODE_VALIDITY_SECONDS", "60", "QR\u7801\u79c1\u94a5\u5bfc\u51fa\u6709\u6548\u671f"],
        ],
        col_widths=[CONTENT_W * 0.35, CONTENT_W * 0.25, CONTENT_W * 0.40],
    ))
    story.append(spacer(8))

    # 1.7 编译与启动
    story.append(section_h2("sec1_7", "1.7  \u7f16\u8bd1\u4e0e\u542f\u52a8"))
    story.append(make_code_block("""# \u7f16\u8bd1 crypto \u5e93
cd ../aicq-crypto && npm run build
# \u7f16\u8bd1 server
cd ../aicq-server && npm run build

# \u5f00\u53d1\u6a21\u5f0f
npm run dev

# \u751f\u4ea7\u6a21\u5f0f (\u76f4\u63a5\u542f\u52a8)
npm start

# \u751f\u4ea7\u6a21\u5f0f (PM2 \u7ba1\u7406)
pm2 start dist/index.js --name aicq-server
pm2 save
pm2 startup"""))
    story.append(spacer(8))

    # 1.8 API 端点列表
    story.append(section_h2("sec1_8", "1.8  API \u7aef\u70b9\u5217\u8868"))
    story.append(body_text("\u4ee5\u4e0b\u662f AICQ Server \u63d0\u4f9b\u7684\u5168\u90e8 REST API \u7aef\u70b9\uff1a"))
    story.append(spacer(2))
    story.append(make_table(
        ["\u65b9\u6cd5", "\u8def\u5f84", "\u8bf4\u660e"],
        [
            ["POST", "/api/v1/node/register", "\u6ce8\u518c\u8282\u70b9"],
            ["POST", "/api/v1/temp-number/request", "\u8bf7\u6c42\u4e34\u65f6\u53f7\u7801"],
            ["GET", "/api/v1/temp-number/:number", "\u67e5\u8be2\u4e34\u65f6\u53f7\u7801"],
            ["DELETE", "/api/v1/temp-number/:number", "\u64a4\u9500\u4e34\u65f6\u53f7\u7801"],
            ["POST", "/api/v1/handshake/initiate", "\u53d1\u8d77\u63e1\u624b"],
            ["POST", "/api/v1/handshake/respond", "\u63d0\u4ea4\u63e1\u624b\u54cd\u5e94"],
            ["POST", "/api/v1/handshake/confirm", "\u786e\u8ba4\u63e1\u624b"],
            ["GET", "/api/v1/friends", "\u83b7\u53d6\u597d\u53cb\u5217\u8868"],
            ["DELETE", "/api/v1/friends/:friendId", "\u5220\u9664\u597d\u53cb"],
            ["POST", "/api/v1/file/initiate", "\u53d1\u8d77\u6587\u4ef6\u4f20\u8f93"],
            ["GET", "/api/v1/file/:sessionId", "\u67e5\u8be2\u4f20\u8f93\u72b6\u6001"],
            ["POST", "/api/v1/file/:sessionId/chunk", "\u4e0a\u62a5\u5757\u8fdb\u5ea6"],
            ["GET", "/api/v1/file/:sessionId/missing", "\u83b7\u53d6\u7f3a\u5931\u5757\uff08\u65ad\u70b9\u7eed\u4f20\uff09"],
            ["GET", "/health", "\u5065\u5eb7\u68c0\u67e5"],
            ["WS", "/ws", "WebSocket \u8fde\u63a5"],
        ],
        col_widths=[CONTENT_W * 0.12, CONTENT_W * 0.45, CONTENT_W * 0.43],
    ))
    story.append(spacer(8))

    # 1.9 Nginx 反向代理配置
    story.append(section_h2("sec1_9", "1.9  Nginx \u53cd\u5411\u4ee3\u7406\u914d\u7f6e"))
    story.append(body_text("\u4ee5\u4e0b\u662f\u63a8\u8350\u7684 Nginx \u914d\u7f6e\uff0c\u5c06 API \u8bf7\u6c42\u4ee3\u7406\u5230 Node.js \u670d\u52a1\uff0cWebSocket \u4ee3\u7406\uff0c\u5e76\u6258\u7ba1\u9759\u6001\u6587\u4ef6\uff1a"))
    story.append(make_code_block("""server {
    listen 80;
    server_name aicq.online;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name aicq.online;

    ssl_certificate /etc/letsencrypt/live/aicq.online/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/aicq.online/privkey.pem;

    # API \u53cd\u5411\u4ee3\u7406
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket \u4ee3\u7406
    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    # \u9759\u6001\u6587\u4ef6\u6258\u7ba1
    location / {
        root /app/web/dist;
        try_files $uri $uri/ /index.html;
        expires 1h;
        add_header Cache-Control "public, immutable";
    }

    # \u5065\u5eb7\u68c0\u67e5\uff08\u65e0\u7f13\u5b58\uff09
    location /health {
        proxy_pass http://localhost:3000;
        add_header Cache-Control "no-cache";
    }
}"""))
    story.append(spacer(8))

    # 1.10 Docker 部署
    story.append(section_h2("sec1_10", "1.10  Docker \u90e8\u7f72"))
    story.append(body_text("\u4f7f\u7528 Docker Compose \u4e00\u952e\u90e8\u7f72\u5168\u90e8\u670d\u52a1\uff1a"))
    story.append(make_code_block("""# \u4e00\u952e Docker \u90e8\u7f72
cd aicq
docker compose -f docker/docker-compose.yml up -d --build

# \u67e5\u770b\u65e5\u5fd7
docker compose -f docker/docker-compose.yml logs -f

# \u505c\u6b62\u670d\u52a1
docker compose -f docker/docker-compose.yml down"""))
    story.append(spacer(8))

    # 1.11 SSL 证书
    story.append(section_h2("sec1_11", "1.11  SSL \u8bc1\u4e66 (Let's Encrypt)"))
    story.append(body_text("\u4f7f\u7528 Let's Encrypt \u514d\u8d39\u7533\u8bf7 SSL \u8bc1\u4e66\uff1a"))
    story.append(make_code_block("""sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d aicq.online
sudo certbot renew --dry-run"""))
    story.append(spacer(8))

    # 1.12 验证部署
    story.append(section_h2("sec1_12", "1.12  \u9a8c\u8bc1\u90e8\u7f72"))
    story.append(body_text("\u90e8\u7f72\u5b8c\u6210\u540e\uff0c\u901a\u8fc7\u5065\u5eb7\u68c0\u67e5\u63a5\u53e3\u9a8c\u8bc1\u670d\u52a1\u662f\u5426\u6b63\u5e38\u8fd0\u884c\uff1a"))
    story.append(make_code_block("""curl https://aicq.online/health
# \u9884\u671f\u8f93\u51fa: {"status":"ok","domain":"aicq.online","uptime":...,"timestamp":...}"""))
    story.append(body_text("\u82e5\u8fd4\u56de <b>status: ok</b> \u5219\u8868\u793a\u670d\u52a1\u5668\u90e8\u7f72\u6210\u529f\u3002"))
    story.append(spacer(12))

    # ============================================================
    # SECTION 2: AICQ Plugin 安装
    # ============================================================
    story.append(section_h1("sec2", "\u7b2c\u4e8c\u7ae0  AICQ Plugin \u5b89\u88c5"))
    story.append(spacer(4))

    # 2.1 概述
    story.append(section_h2("sec2_1", "2.1  \u6982\u8ff0"))
    story.append(body_text("AICQ Plugin \u662f OpenClaw \u5e73\u53f0\u63d2\u4ef6\uff0c\u4e3a AI Agent \u63d0\u4f9b\u7aef\u5230\u7aef\u52a0\u5bc6\u901a\u4fe1\u80fd\u529b\u3002\u5176\u4e3b\u8981\u529f\u80fd\u5305\u62ec\uff1a"))
    story.append(make_bullet("\u6ce8\u518c Channel / Tool / Hook / Service \u7b49\u591a\u79cd OpenClaw \u80fd\u529b"))
    story.append(make_bullet("\u62e6\u622a\u6d88\u606f\u5e76\u81ea\u52a8\u52a0\u5bc6"))
    story.append(make_bullet("\u7ba1\u7406\u597d\u53cb\u5173\u7cfb\uff08\u6dfb\u52a0\u3001\u5217\u8868\u3001\u5220\u9664\uff09"))
    story.append(spacer(2))
    story.append(body_text("<b>\u4f9d\u8d56\uff1a</b>@aicq/crypto \u5e93 + OpenClaw Agent Runtime"))
    story.append(spacer(8))

    # 2.2 前置条件
    story.append(section_h2("sec2_2", "2.2  \u524d\u7f6e\u6761\u4ef6"))
    story.append(make_bullet("\u5df2\u5b89\u88c5 OpenClaw Agent Runtime"))
    story.append(make_bullet("AICQ Server \u5df2\u90e8\u7f72\u4e14\u53ef\u8bbf\u95ee"))
    story.append(make_bullet("Node.js \u2265 18"))
    story.append(spacer(8))

    # 2.3 安装方式
    story.append(section_h2("sec2_3", "2.3  \u5b89\u88c5\u65b9\u5f0f"))
    story.append(section_h3("\u65b9\u5f0f\u4e00\uff1a\u4ece\u6e90\u7801\u5b89\u88c5"))
    story.append(make_code_block("""git clone https://github.com/ctz168/aicq.git
cd aicq
cd aicq-crypto && npm install && npm run build
cd ../aicq-plugin && npm install && npm run build"""))
    story.append(section_h3("\u65b9\u5f0f\u4e8c\uff1anpm \u5305\u5b89\u88c5\uff08\u5982\u5df2\u53d1\u5e03\uff09"))
    story.append(make_code_block("""npm install @aicq/plugin"""))
    story.append(spacer(8))

    # 2.4 配置
    story.append(section_h2("sec2_4", "2.4  \u914d\u7f6e"))
    story.append(body_text("\u4ee5\u4e0b\u73af\u5883\u53d8\u91cf\u63a7\u5236\u63d2\u4ef6\u884c\u4e3a\uff1a"))
    story.append(spacer(2))
    story.append(make_table(
        ["\u53d8\u91cf\u540d", "\u9ed8\u8ba4\u503c", "\u8bf4\u660e"],
        [
            ["AICQ_SERVER_URL", "https://aicq.online", "AICQ \u670d\u52a1\u5668\u5730\u5740"],
            ["AICQ_AGENT_ID", "(\u81ea\u52a8\u751f\u6210)", "Agent \u552f\u4e00\u6807\u8bc6"],
            ["AICQ_MAX_FRIENDS", "200", "\u6700\u5927\u597d\u53cb\u6570"],
            ["AICQ_AUTO_ACCEPT", "false", "\u662f\u5426\u81ea\u52a8\u63a5\u53d7\u597d\u53cb\u8bf7\u6c42"],
        ],
        col_widths=[CONTENT_W * 0.30, CONTENT_W * 0.30, CONTENT_W * 0.40],
    ))
    story.append(spacer(8))

    # 2.5 注册到 OpenClaw
    story.append(section_h2("sec2_5", "2.5  \u6ce8\u518c\u5230 OpenClaw"))
    story.append(body_text("\u5c06 aicq-plugin \u76ee\u5f55\u590d\u5236\u5230 OpenClaw \u7684 plugins \u76ee\u5f55\uff1a"))
    story.append(make_code_block("""cp -r aicq-plugin /path/to/openclaw/plugins/aicq-chat
# \u91cd\u542f OpenClaw Agent"""))
    story.append(spacer(8))

    # 2.6 插件注册的能力
    story.append(section_h2("sec2_6", "2.6  \u63d2\u4ef6\u6ce8\u518c\u7684\u80fd\u529b"))
    story.append(spacer(2))
    story.append(make_table(
        ["\u7c7b\u578b", "\u540d\u79f0", "\u8bf4\u660e"],
        [
            ["Channel", "encrypted-chat", "\u52a0\u5bc6P2P\u804a\u5929\u9891\u9053"],
            ["Tool", "chat-friend", "\u597d\u53cb\u7ba1\u7406\uff08\u6dfb\u52a0/\u5217\u8868/\u5220\u9664/\u8bf7\u6c42\u4e34\u65f6\u53f7\uff09"],
            ["Tool", "chat-send", "\u53d1\u9001\u52a0\u5bc6\u6d88\u606f"],
            ["Tool", "chat-export-key", "\u5bfc\u51fa\u79c1\u94a5QR\u7801"],
            ["Hook", "message_sending", "\u62e6\u622a\u51fa\u7ad9\u6d88\u606f\u8fdb\u884c\u52a0\u5bc6"],
            ["Hook", "before_tool_call", "\u5de5\u5177\u8c03\u7528\u6743\u9650\u68c0\u67e5"],
            ["Service", "identity-service", "\u8eab\u4efd\u5bc6\u94a5\u7ba1\u7406\u670d\u52a1"],
        ],
        col_widths=[CONTENT_W * 0.15, CONTENT_W * 0.25, CONTENT_W * 0.60],
    ))
    story.append(spacer(8))

    # 2.7 验证安装
    story.append(section_h2("sec2_7", "2.7  \u9a8c\u8bc1\u5b89\u88c5"))
    story.append(body_text("\u53ef\u4ee5\u72ec\u7acb\u8fd0\u884c\u63d2\u4ef6\u6d4b\u8bd5\uff08\u4e0d\u4f9d\u8d56 OpenClaw Runtime\uff09\uff1a"))
    story.append(make_code_block("""# \u72ec\u7acb\u6d4b\u8bd5\uff08\u4e0d\u4f9d\u8d56 OpenClaw Runtime\uff09
cd aicq-plugin
npm run dev
# \u9884\u671f\u770b\u5230: AICQ Plugin activated successfully!"""))
    story.append(spacer(12))

    # ============================================================
    # SECTION 3: AICQ Web Client 部署
    # ============================================================
    story.append(section_h1("sec3", "\u7b2c\u4e09\u7ae0  AICQ Web Client \u90e8\u7f72"))
    story.append(spacer(4))

    # 3.1 概述
    story.append(section_h2("sec3_1", "3.1  \u6982\u8ff0"))
    story.append(body_text("AICQ Web Client \u662f\u57fa\u4e8e React + TypeScript + Vite \u6784\u5efa\u7684\u524d\u7aef\u5e94\u7528\uff0c\u63d0\u4f9b\u5b8c\u6574\u7684\u7528\u6237\u754c\u9762\u4f53\u9a8c\u3002\u4e3b\u8981\u529f\u80fd\u5305\u62ec\uff1a"))
    story.append(make_bullet("\u7528\u6237\u767b\u5f55\u4e0e\u8eab\u4efd\u7ba1\u7406"))
    story.append(make_bullet("\u804a\u5929\u5217\u8868\u4e0e\u5b9e\u65f6\u52a0\u5bc6\u804a\u5929"))
    story.append(make_bullet("\u6587\u4ef6\u4f20\u8f93\uff08\u652f\u6301\u65ad\u70b9\u7eed\u4f20\uff09"))
    story.append(make_bullet("\u56fe\u7247/\u89c6\u9891\u9884\u89c8"))
    story.append(make_bullet("Markdown \u6e32\u67d3\u4e0e\u6d41\u5f0f AI \u8f93\u51fa"))
    story.append(spacer(2))
    story.append(body_text("\u5e94\u7528\u53ef\u5c01\u88c5\u4e3a WebView\u3001Android APK\u3001iOS App\uff08\u901a\u8fc7 Capacitor\uff09\u3002"))
    story.append(spacer(8))

    # 3.2 系统要求
    story.append(section_h2("sec3_2", "3.2  \u7cfb\u7edf\u8981\u6c42"))
    story.append(make_bullet("Node.js \u2265 18\uff0cnpm \u2265 9"))
    story.append(make_bullet("\u7f16\u8bd1\u9700\u8981 4GB+ RAM\uff08Vite \u6784\u5efa\u8f83\u5927 bundle\uff09"))
    story.append(spacer(8))

    # 3.3 安装与构建
    story.append(section_h2("sec3_3", "3.3  \u5b89\u88c5\u4e0e\u6784\u5efa"))
    story.append(make_code_block("""cd aicq
cd aicq-crypto && npm install && npm run build
cd ../aicq-web && npm install
npm run build    # \u4ea7\u51fa dist/ \u76ee\u5f55"""))
    story.append(spacer(8))

    # 3.4 配置
    story.append(section_h2("sec3_4", "3.4  \u914d\u7f6e"))
    story.append(body_text("\u5f00\u53d1\u6a21\u5f0f\u4e0b vite.config.ts \u4e2d\u7684\u4ee3\u7406\u914d\u7f6e\uff1a"))
    story.append(make_bullet("/api  \u2192  http://localhost:3000"))
    story.append(make_bullet("/ws  \u2192  ws://localhost:3000"))
    story.append(body_text("\u751f\u4ea7\u73af\u5883\u4e0d\u9700\u8981\u4ee3\u7406\uff0c\u901a\u8fc7 Nginx \u53cd\u5411\u4ee3\u7406\u5904\u7406\u3002"))
    story.append(spacer(8))

    # 3.5 Nginx 静态托管
    story.append(section_h2("sec3_5", "3.5  Nginx \u9759\u6001\u6258\u7ba1"))
    story.append(body_text("\u5c06\u6784\u5efa\u4ea7\u7269 dist/ \u76ee\u5f55\u901a\u8fc7 Nginx \u6258\u7ba1\uff1a"))
    story.append(make_code_block("""location / {
    root /path/to/aicq-web/dist;
    try_files $uri $uri/ /index.html;
    expires 1h;
}"""))
    story.append(spacer(8))

    # 3.6 开发模式
    story.append(section_h2("sec3_6", "3.6  \u5f00\u53d1\u6a21\u5f0f"))
    story.append(make_code_block("""cd aicq-web
npm run dev    # \u542f\u52a8\u5728 http://localhost:5173"""))
    story.append(spacer(8))

    # 3.7 移动端打包
    story.append(section_h2("sec3_7", "3.7  \u79fb\u52a8\u7aef\u6253\u5305 (Capacitor)"))
    story.append(body_text("\u4f7f\u7528 Capacitor \u5c06 Web \u5e94\u7528\u6253\u5305\u4e3a\u539f\u751f\u79fb\u52a8\u7aef\u5e94\u7528\uff1a"))
    story.append(make_code_block("""# \u5b89\u88c5 Capacitor
npm install @capacitor/core @capacitor/cli
npm install @capacitor/android @capacitor/ios
npx cap init "AICQ" "online.aicq.app" --web-dir dist

# Android
npx cap add android
npx cap sync android
npx cap open android   # \u5728 Android Studio \u4e2d\u6784\u5efa APK

# iOS
npx cap add ios
npx cap sync ios
npx cap open ios       # \u5728 Xcode \u4e2d\u6784\u5efa"""))
    story.append(spacer(8))

    # 3.8 功能清单
    story.append(section_h2("sec3_8", "3.8  \u529f\u80fd\u6e05\u5355"))
    story.append(spacer(2))
    story.append(make_table(
        ["\u529f\u80fd", "\u8bf4\u660e"],
        [
            ["\u6587\u672c\u804a\u5929", "\u7aef\u5230\u7aef\u52a0\u5bc6\u6587\u672c\u6d88\u606f"],
            ["Markdown", "GFM\u652f\u6301\u3001\u4ee3\u7801\u9ad8\u4eae\u3001\u8868\u683c\u3001\u4e00\u952e\u590d\u5236"],
            ["\u6d41\u5f0f\u8f93\u51fa", "AI\u56de\u590d\u901atoken\u663e\u793a\u3001\u52a8\u753b\u5149\u6807"],
            ["\u56fe\u7247", "\u7f29\u7565\u56fe\u9884\u89c8\u3001\u706f\u7bb1\u5168\u5c4f"],
            ["\u89c6\u9891", "\u81ea\u5b9a\u4e49\u64ad\u653e\u5668\u3001\u8fdb\u5ea6\u62d6\u62fd\u3001\u5168\u5c4f"],
            ["\u6587\u4ef6\u4f20\u8f93", "64KB\u5206\u5757\u3001\u65ad\u70b9\u7eed\u4f20\u3001\u901f\u5ea6/ETA\u663e\u793a"],
            ["\u62d6\u62fd\u4e0a\u4f20", "\u62d6\u62fd\u6587\u4ef6\u5230\u804a\u5929\u533a\u57df\u81ea\u52a8\u53d1\u9001"],
            ["\u4e34\u65f6\u53f7\u7801", "6\u4f4d\u6570\u300124h\u6709\u6548\u671f"],
        ],
        col_widths=[CONTENT_W * 0.25, CONTENT_W * 0.75],
    ))
    story.append(spacer(8))

    # 3.9 目录结构
    story.append(section_h2("sec3_9", "3.9  \u76ee\u5f55\u7ed3\u6784"))
    story.append(make_code_block("""aicq-web/
  src/
    components/    # UI \u7ec4\u4ef6 (MarkdownRenderer, ImagePreview, VideoPlayer, StreamingMessage...)
    screens/       # \u9875\u9762 (ChatScreen, LoginScreen, FriendsScreen...)
    services/      # WebClient \u670d\u52a1\u5c42
    context/       # React Context \u72b6\u6001\u7ba1\u7406
    types.ts       # TypeScript \u7c7b\u578b\u5b9a\u4e49
  dist/            # \u6784\u5efa\u4ea7\u7269 (\u90e8\u7f72\u6b64\u76ee\u5f55)"""))
    story.append(spacer(8))

    # 3.10 部署验证
    story.append(section_h2("sec3_10", "3.10  \u90e8\u7f72\u9a8c\u8bc1"))
    story.append(body_text("\u90e8\u7f72\u5b8c\u6210\u540e\uff0c\u8bbf\u95ee https://aicq.online \u5e94\u770b\u5230\u767b\u5f55\u9875\u9762\u3002\u5982\u679c\u9875\u9762\u6b63\u5e38\u52a0\u8f7d\uff0c\u8868\u793a\u524d\u7aef\u90e8\u7f72\u6210\u529f\u3002"))
    story.append(spacer(4))
    story.append(body_text("\u540c\u65f6\u786e\u4fdd\uff1a"))
    story.append(make_bullet("\u540e\u7aef API \u53ef\u6b63\u5e38\u8bbf\u95ee\uff08\u53c2\u89c1\u7b2c\u4e00\u7ae0\u9a8c\u8bc1\u90e8\u5206\uff09"))
    story.append(make_bullet("WebSocket \u8fde\u63a5\u53ef\u6b63\u5e38\u5efa\u7acb"))
    story.append(make_bullet("SSL \u8bc1\u4e66\u6709\u6548\u4e14 HTTPS \u6b63\u5e38\u5de5\u4f5c"))

    # ============================================================
    # Build with multiBuild for TOC
    # ============================================================
    doc.multiBuild(story)
    print(f"PDF generated successfully: {output_path}")


if __name__ == "__main__":
    output = "/home/z/my-project/download/AICQ_Deployment_Guide.pdf"
    os.makedirs(os.path.dirname(output), exist_ok=True)
    build_pdf(output)
