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
        line.replace("&", "&").replace("<", "<").replace(">", ">")
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
    bullet_char = "•"
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
    canvas.drawString(LEFT_MARGIN, PAGE_H - TOP_MARGIN + 8*mm, "AICQ 部署指南")
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
        c.drawCentredString(cx, y, "AICQ 部署指南")

        # Decorative line under title
        y -= 12*mm
        c.setStrokeColor(COLOR_COVER_LINE)
        c.setLineWidth(1)
        c.line(cx - 40*mm, y, cx + 40*mm, y)

        # Subtitle
        y -= 15*mm
        c.setFont("SimHei", 14)
        c.setFillColor(COLOR_SECONDARY)
        c.drawCentredString(cx, y, "服务器 · 插件 · 客户端  三大板块独立部署手册")

        # Version info
        y -= 12*mm
        c.setFont("TimesNewRoman", 11)
        c.setFillColor(COLOR_ACCENT)
        c.drawCentredString(cx, y, "AICQ Deployment Guide  v1.0")

        # Feature tags
        y -= 20*mm
        tags = ["零知识架构", "端到端加密", "P2P 通信", "WebSocket 中继", "断点续传"]
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
    cover_frame = Frame(LEFT_MARGIN, BOTTOM_MARGIN, CONTENT_W, PAGE_H - TOP_MARGIN - BOTTOM_MARGIN, id="cover", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
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
    story.append(Paragraph("目录", ParagraphStyle(
        "TOCTitle", fontName="SimHei", fontSize=22, leading=30,
        textColor=COLOR_PRIMARY, alignment=TA_LEFT, spaceAfter=12,
    )))
    story.append(toc)
    story.append(NextPageTemplate("Content"))
    story.append(PageBreak())

    # ============================================================
    # SECTION 1: AICQ Server 部署
    # ============================================================
    story.append(section_h1("sec1", "第一章  AICQ Server 部署"))
    story.append(spacer(4))

    # 1.1 概述
    story.append(section_h2("sec1_1", "1.1  概述"))
    story.append(body_text("AICQ Server 是基于 Node.js/Express + WebSocket 的中继服务器，是整个 AICQ 通信系统的核心组件。服务器负责以下关键功能："))
    story.append(make_bullet("节点注册与管理"))
    story.append(make_bullet("临时号码分配（6位数字）"))
    story.append(make_bullet("握手协调（加密协商）"))
    story.append(make_bullet("P2P 信令中继"))
    story.append(make_bullet("文件传输协调"))
    story.append(spacer(4))
    story.append(body_text("在零知识架构下，服务器不存储任何消息内容，不持有用户私钥，确保通信的完全隐私保护。"))
    story.append(spacer(2))
    story.append(body_text("<b>技术栈：</b>Express 4.18、ws 8.16、TypeScript 5.3、Node.js ≥ 18"))
    story.append(spacer(6))

    # 1.2 系统要求
    story.append(section_h2("sec1_2", "1.2  系统要求"))
    story.append(spacer(2))
    story.append(make_table(
        ["项目", "最低配置", "推荐配置"],
        [
            ["CPU", "1核", "2核"],
            ["内存", "512MB", "2GB"],
            ["硬盘", "10GB SSD", "50GB SSD"],
            ["操作系统", "Ubuntu 20.04 / CentOS 8", "Ubuntu 22.04 LTS"],
            ["Node.js", "18.x LTS", "20.x LTS"],
            ["网络", "公网IP + 域名", "公网IP + 域名 + SSL证书"],
        ],
        col_widths=[CONTENT_W * 0.25, CONTENT_W * 0.35, CONTENT_W * 0.40],
    ))
    story.append(spacer(8))

    # 1.3 环境准备
    story.append(section_h2("sec1_3", "1.3  环境准备"))
    story.append(body_text("以下命令用于在 Ubuntu 系统上安装 Node.js 20.x 及 PM2 进程管理器："))
    story.append(make_code_block("""# 安装 Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v && npm -v

# 安装 PM2 进程管理器（推荐生产环境使用）
sudo npm install -g pm2"""))
    story.append(spacer(8))

    # 1.4 获取源码
    story.append(section_h2("sec1_4", "1.4  获取源码"))
    story.append(make_code_block("""git clone https://github.com/ctz168/aicq.git
cd aicq"""))
    story.append(spacer(8))

    # 1.5 安装依赖
    story.append(section_h2("sec1_5", "1.5  安装依赖"))
    story.append(body_text("分别安装加密库和服务器的依赖："))
    story.append(make_code_block("""cd aicq-crypto && npm install
cd ../aicq-server && npm install"""))
    story.append(spacer(8))

    # 1.6 配置
    story.append(section_h2("sec1_6", "1.6  配置"))
    story.append(body_text("在 aicq-server 目录下复制环境配置模板并按需修改："))
    story.append(make_code_block("""cd aicq-server
cp .env.example .env
# 编辑 .env 按需修改配置
nano .env"""))
    story.append(spacer(4))
    story.append(body_text("<b>配置变量说明：</b>"))
    story.append(spacer(2))
    story.append(make_table(
        ["变量名", "默认值", "说明"],
        [
            ["PORT", "3000", "服务监听端口"],
            ["DOMAIN", "aicq.online", "服务器域名"],
            ["MAX_FRIENDS", "200", "每节点最大好友数"],
            ["TEMP_NUMBER_TTL_HOURS", "24", "临时号码有效期（小时）"],
            ["QR_CODE_VALIDITY_SECONDS", "60", "QR码私钥导出有效期"],
        ],
        col_widths=[CONTENT_W * 0.35, CONTENT_W * 0.25, CONTENT_W * 0.40],
    ))
    story.append(spacer(8))

    # 1.7 编译与启动
    story.append(section_h2("sec1_7", "1.7  编译与启动"))
    story.append(make_code_block("""# 编译 crypto 库
cd ../aicq-crypto && npm run build
# 编译 server
cd ../aicq-server && npm run build

# 开发模式
npm run dev

# 生产模式 (直接启动)
npm start

# 生产模式 (PM2 管理)
pm2 start dist/index.js --name aicq-server
pm2 save
pm2 startup"""))
    story.append(spacer(8))

    # 1.8 API 端点列表
    story.append(section_h2("sec1_8", "1.8  API 端点列表"))
    story.append(body_text("以下是 AICQ Server 提供的全部 REST API 端点："))
    story.append(spacer(2))
    story.append(make_table(
        ["方法", "路径", "说明"],
        [
            ["POST", "/api/v1/node/register", "注册节点"],
            ["POST", "/api/v1/temp-number/request", "请求临时号码"],
            ["GET", "/api/v1/temp-number/:number", "查询临时号码"],
            ["DELETE", "/api/v1/temp-number/:number", "撤销临时号码"],
            ["POST", "/api/v1/handshake/initiate", "发起握手"],
            ["POST", "/api/v1/handshake/respond", "提交握手响应"],
            ["POST", "/api/v1/handshake/confirm", "确认握手"],
            ["GET", "/api/v1/friends", "获取好友列表"],
            ["DELETE", "/api/v1/friends/:friendId", "删除好友"],
            ["POST", "/api/v1/file/initiate", "发起文件传输"],
            ["GET", "/api/v1/file/:sessionId", "查询传输状态"],
            ["POST", "/api/v1/file/:sessionId/chunk", "上报块进度"],
            ["GET", "/api/v1/file/:sessionId/missing", "获取缺失块（断点续传）"],
            ["GET", "/health", "健康检查"],
            ["WS", "/ws", "WebSocket 连接"],
        ],
        col_widths=[CONTENT_W * 0.12, CONTENT_W * 0.45, CONTENT_W * 0.43],
    ))
    story.append(spacer(8))

    # 1.9 Nginx 反向代理配置
    story.append(section_h2("sec1_9", "1.9  Nginx 反向代理配置"))
    story.append(body_text("以下是推荐的 Nginx 配置，将 API 请求代理到 Node.js 服务，WebSocket 代理，并托管静态文件："))
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

    # API 反向代理
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket 代理
    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    # 静态文件托管
    location / {
        root /app/web/dist;
        try_files $uri $uri/ /index.html;
        expires 1h;
        add_header Cache-Control "public, immutable";
    }

    # 健康检查（无缓存）
    location /health {
        proxy_pass http://localhost:3000;
        add_header Cache-Control "no-cache";
    }
}"""))
    story.append(spacer(8))

    # 1.10 Docker 部署
    story.append(section_h2("sec1_10", "1.10  Docker 部署"))
    story.append(body_text("使用 Docker Compose 一键部署全部服务："))
    story.append(make_code_block("""# 一键 Docker 部署
cd aicq
docker compose -f docker/docker-compose.yml up -d --build

# 查看日志
docker compose -f docker/docker-compose.yml logs -f

# 停止服务
docker compose -f docker/docker-compose.yml down"""))
    story.append(spacer(8))

    # 1.11 SSL 证书
    story.append(section_h2("sec1_11", "1.11  SSL 证书 (Let's Encrypt)"))
    story.append(body_text("使用 Let's Encrypt 免费申请 SSL 证书："))
    story.append(make_code_block("""sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d aicq.online
sudo certbot renew --dry-run"""))
    story.append(spacer(8))

    # 1.12 验证部署
    story.append(section_h2("sec1_12", "1.12  验证部署"))
    story.append(body_text("部署完成后，通过健康检查接口验证服务是否正常运行："))
    story.append(make_code_block("""curl https://aicq.online/health
# 预期输出: {"status":"ok","domain":"aicq.online","uptime":...,"timestamp":...}"""))
    story.append(body_text("若返回 <b>status: ok</b> 则表示服务器部署成功。"))
    story.append(spacer(12))

    # ============================================================
    # SECTION 2: AICQ Plugin 安装
    # ============================================================
    story.append(section_h1("sec2", "第二章  AICQ Plugin 安装"))
    story.append(spacer(4))

    # 2.1 概述
    story.append(section_h2("sec2_1", "2.1  概述"))
    story.append(body_text("AICQ Plugin 是 OpenClaw 平台插件，为 AI Agent 提供端到端加密通信能力。其主要功能包括："))
    story.append(make_bullet("注册 Channel / Tool / Hook / Service 等多种 OpenClaw 能力"))
    story.append(make_bullet("拦截消息并自动加密"))
    story.append(make_bullet("管理好友关系（添加、列表、删除）"))
    story.append(spacer(2))
    story.append(body_text("<b>依赖：</b>@aicq/crypto 库 + OpenClaw Agent Runtime"))
    story.append(spacer(8))

    # 2.2 前置条件
    story.append(section_h2("sec2_2", "2.2  前置条件"))
    story.append(make_bullet("已安装 OpenClaw Agent Runtime"))
    story.append(make_bullet("AICQ Server 已部署且可访问"))
    story.append(make_bullet("Node.js ≥ 18"))
    story.append(spacer(8))

    # 2.3 安装方式
    story.append(section_h2("sec2_3", "2.3  安装方式"))
    story.append(section_h3("方式一：从源码安装"))
    story.append(make_code_block("""git clone https://github.com/ctz168/aicq.git
cd aicq
cd aicq-crypto && npm install && npm run build
cd ../aicq-plugin && npm install && npm run build"""))
    story.append(section_h3("方式二：npm 包安装（如已发布）"))
    story.append(make_code_block("""npm install @aicq/plugin"""))
    story.append(spacer(8))

    # 2.4 配置
    story.append(section_h2("sec2_4", "2.4  配置"))
    story.append(body_text("以下环境变量控制插件行为："))
    story.append(spacer(2))
    story.append(make_table(
        ["变量名", "默认值", "说明"],
        [
            ["AICQ_SERVER_URL", "https://aicq.online", "AICQ 服务器地址"],
            ["AICQ_AGENT_ID", "(自动生成)", "Agent 唯一标识"],
            ["AICQ_MAX_FRIENDS", "200", "最大好友数"],
            ["AICQ_AUTO_ACCEPT", "false", "是否自动接受好友请求"],
        ],
        col_widths=[CONTENT_W * 0.30, CONTENT_W * 0.30, CONTENT_W * 0.40],
    ))
    story.append(spacer(8))

    # 2.5 注册到 OpenClaw
    story.append(section_h2("sec2_5", "2.5  注册到 OpenClaw"))
    story.append(body_text("将 aicq-plugin 目录复制到 OpenClaw 的 plugins 目录："))
    story.append(make_code_block("""cp -r aicq-plugin /path/to/openclaw/plugins/aicq-chat
# 重启 OpenClaw Agent"""))
    story.append(spacer(8))

    # 2.6 插件注册的能力
    story.append(section_h2("sec2_6", "2.6  插件注册的能力"))
    story.append(spacer(2))
    story.append(make_table(
        ["类型", "名称", "说明"],
        [
            ["Channel", "encrypted-chat", "加密P2P聊天频道"],
            ["Tool", "chat-friend", "好友管理（添加/列表/删除/请求临时号）"],
            ["Tool", "chat-send", "发送加密消息"],
            ["Tool", "chat-export-key", "导出私钥QR码"],
            ["Hook", "message_sending", "拦截出站消息进行加密"],
            ["Hook", "before_tool_call", "工具调用权限检查"],
            ["Service", "identity-service", "身份密钥管理服务"],
        ],
        col_widths=[CONTENT_W * 0.15, CONTENT_W * 0.25, CONTENT_W * 0.60],
    ))
    story.append(spacer(8))

    # 2.7 验证安装
    story.append(section_h2("sec2_7", "2.7  验证安装"))
    story.append(body_text("可以独立运行插件测试（不依赖 OpenClaw Runtime）："))
    story.append(make_code_block("""# 独立测试（不依赖 OpenClaw Runtime）
cd aicq-plugin
npm run dev
# 预期看到: AICQ Plugin activated successfully!"""))
    story.append(spacer(12))

    # ============================================================
    # SECTION 3: AICQ Web Client 部署
    # ============================================================
    story.append(section_h1("sec3", "第三章  AICQ Web Client 部署"))
    story.append(spacer(4))

    # 3.1 概述
    story.append(section_h2("sec3_1", "3.1  概述"))
    story.append(body_text("AICQ Web Client 是基于 React + TypeScript + Vite 构建的前端应用，提供完整的用户界面体验。主要功能包括："))
    story.append(make_bullet("用户登录与身份管理"))
    story.append(make_bullet("聊天列表与实时加密聊天"))
    story.append(make_bullet("文件传输（支持断点续传）"))
    story.append(make_bullet("图片/视频预览"))
    story.append(make_bullet("Markdown 渲染与流式 AI 输出"))
    story.append(spacer(2))
    story.append(body_text("应用可封装为 WebView、Android APK、iOS App（通过 Capacitor）。"))
    story.append(spacer(8))

    # 3.2 系统要求
    story.append(section_h2("sec3_2", "3.2  系统要求"))
    story.append(make_bullet("Node.js ≥ 18，npm ≥ 9"))
    story.append(make_bullet("编译需要 4GB+ RAM（Vite 构建较大 bundle）"))
    story.append(spacer(8))

    # 3.3 安装与构建
    story.append(section_h2("sec3_3", "3.3  安装与构建"))
    story.append(make_code_block("""cd aicq
cd aicq-crypto && npm install && npm run build
cd ../aicq-web && npm install
npm run build    # 产出 dist/ 目录"""))
    story.append(spacer(8))

    # 3.4 配置
    story.append(section_h2("sec3_4", "3.4  配置"))
    story.append(body_text("开发模式下 vite.config.ts 中的代理配置："))
    story.append(make_bullet("/api  →  http://localhost:3000"))
    story.append(make_bullet("/ws  →  ws://localhost:3000"))
    story.append(body_text("生产环境不需要代理，通过 Nginx 反向代理处理。"))
    story.append(spacer(8))

    # 3.5 Nginx 静态托管
    story.append(section_h2("sec3_5", "3.5  Nginx 静态托管"))
    story.append(body_text("将构建产物 dist/ 目录通过 Nginx 托管："))
    story.append(make_code_block("""location / {
    root /path/to/aicq-web/dist;
    try_files $uri $uri/ /index.html;
    expires 1h;
}"""))
    story.append(spacer(8))

    # 3.6 开发模式
    story.append(section_h2("sec3_6", "3.6  开发模式"))
    story.append(make_code_block("""cd aicq-web
npm run dev    # 启动在 http://localhost:5173"""))
    story.append(spacer(8))

    # 3.7 移动端打包
    story.append(section_h2("sec3_7", "3.7  移动端打包 (Capacitor)"))
    story.append(body_text("使用 Capacitor 将 Web 应用打包为原生移动端应用："))
    story.append(make_code_block("""# 安装 Capacitor
npm install @capacitor/core @capacitor/cli
npm install @capacitor/android @capacitor/ios
npx cap init "AICQ" "online.aicq.app" --web-dir dist

# Android
npx cap add android
npx cap sync android
npx cap open android   # 在 Android Studio 中构建 APK

# iOS
npx cap add ios
npx cap sync ios
npx cap open ios       # 在 Xcode 中构建"""))
    story.append(spacer(8))

    # 3.8 功能清单
    story.append(section_h2("sec3_8", "3.8  功能清单"))
    story.append(spacer(2))
    story.append(make_table(
        ["功能", "说明"],
        [
            ["文本聊天", "端到端加密文本消息"],
            ["Markdown", "GFM支持、代码高亮、表格、一键复制"],
            ["流式输出", "AI回复通token显示、动画光标"],
            ["图片", "缩略图预览、灯箱全屏"],
            ["视频", "自定义播放器、进度拖拽、全屏"],
            ["文件传输", "64KB分块、断点续传、速度/ETA显示"],
            ["拖拽上传", "拖拽文件到聊天区域自动发送"],
            ["临时号码", "6位数、24h有效期"],
        ],
        col_widths=[CONTENT_W * 0.25, CONTENT_W * 0.75],
    ))
    story.append(spacer(8))

    # 3.9 目录结构
    story.append(section_h2("sec3_9", "3.9  目录结构"))
    story.append(make_code_block("""aicq-web/
  src/
    components/    # UI 组件 (MarkdownRenderer, ImagePreview, VideoPlayer, StreamingMessage...)
    screens/       # 页面 (ChatScreen, LoginScreen, FriendsScreen...)
    services/      # WebClient 服务层
    context/       # React Context 状态管理
    types.ts       # TypeScript 类型定义
  dist/            # 构建产物 (部署此目录)"""))
    story.append(spacer(8))

    # 3.10 部署验证
    story.append(section_h2("sec3_10", "3.10  部署验证"))
    story.append(body_text("部署完成后，访问 https://aicq.online 应看到登录页面。如果页面正常加载，表示前端部署成功。"))
    story.append(spacer(4))
    story.append(body_text("同时确保："))
    story.append(make_bullet("后端 API 可正常访问（参见第一章验证部分）"))
    story.append(make_bullet("WebSocket 连接可正常建立"))
    story.append(make_bullet("SSL 证书有效且 HTTPS 正常工作"))

    # ============================================================
    # Build with multiBuild for TOC
    # ============================================================
    doc.multiBuild(story)
    print(f"PDF generated successfully: {output_path}")


if __name__ == "__main__":
    output = "/home/z/my-project/download/AICQ_Deployment_Guide.pdf"
    os.makedirs(os.path.dirname(output), exist_ok=True)
    build_pdf(output)
