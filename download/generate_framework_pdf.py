# -*- coding: utf-8 -*-
"""
OpenClaw Chat - 修订版框架设计文档 PDF 生成器
"""

from reportlab.lib.pagesizes import A4
from reportlab.platypus import (
    Paragraph, Spacer, PageBreak, Table, TableStyle, KeepTogether
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.lib import colors
from reportlab.lib.units import cm, inch
from reportlab.platypus import SimpleDocTemplate
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
import os

# ============ Font Registration ============
pdfmetrics.registerFont(TTFont('Microsoft YaHei', '/usr/share/fonts/truetype/chinese/msyh.ttf'))
pdfmetrics.registerFont(TTFont('SimHei', '/usr/share/fonts/truetype/chinese/SimHei.ttf'))
pdfmetrics.registerFont(TTFont('SarasaMonoSC', '/usr/share/fonts/truetype/chinese/SarasaMonoSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('Times New Roman', '/usr/share/fonts/truetype/english/Times-New-Roman.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'))

registerFontFamily('Microsoft YaHei', normal='Microsoft YaHei', bold='Microsoft YaHei')
registerFontFamily('SimHei', normal='SimHei', bold='SimHei')
registerFontFamily('Times New Roman', normal='Times New Roman', bold='Times New Roman')
registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSans')

# ============ Color Scheme ============
TABLE_HEADER_COLOR = colors.HexColor('#1F4E79')
TABLE_HEADER_TEXT = colors.white
TABLE_ROW_EVEN = colors.white
TABLE_ROW_ODD = colors.HexColor('#F5F5F5')
ACCENT_COLOR = colors.HexColor('#2E75B6')

# ============ Custom DocTemplate for TOC ============
class TocDocTemplate(SimpleDocTemplate):
    def __init__(self, *args, **kwargs):
        SimpleDocTemplate.__init__(self, *args, **kwargs)
    
    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            level = getattr(flowable, 'bookmark_level', 0)
            text = getattr(flowable, 'bookmark_text', '')
            self.notify('TOCEntry', (level, text, self.page))

# ============ Style Definitions ============
cover_title_style = ParagraphStyle(
    name='CoverTitle',
    fontName='Microsoft YaHei',
    fontSize=36,
    leading=48,
    alignment=TA_CENTER,
    spaceAfter=24,
    wordWrap='CJK',
)

cover_subtitle_style = ParagraphStyle(
    name='CoverSubtitle',
    fontName='SimHei',
    fontSize=18,
    leading=26,
    alignment=TA_CENTER,
    spaceAfter=36,
    wordWrap='CJK',
)

cover_info_style = ParagraphStyle(
    name='CoverInfo',
    fontName='SimHei',
    fontSize=13,
    leading=22,
    alignment=TA_CENTER,
    spaceAfter=12,
    wordWrap='CJK',
)

h1_style = ParagraphStyle(
    name='H1Style',
    fontName='Microsoft YaHei',
    fontSize=20,
    leading=30,
    spaceBefore=24,
    spaceAfter=12,
    textColor=colors.black,
    wordWrap='CJK',
)

h2_style = ParagraphStyle(
    name='H2Style',
    fontName='Microsoft YaHei',
    fontSize=15,
    leading=24,
    spaceBefore=18,
    spaceAfter=8,
    textColor=colors.black,
    wordWrap='CJK',
)

h3_style = ParagraphStyle(
    name='H3Style',
    fontName='SimHei',
    fontSize=12,
    leading=20,
    spaceBefore=12,
    spaceAfter=6,
    textColor=colors.black,
    wordWrap='CJK',
)

body_style = ParagraphStyle(
    name='BodyStyle',
    fontName='SimHei',
    fontSize=10.5,
    leading=18,
    alignment=TA_LEFT,
    firstLineIndent=21,
    wordWrap='CJK',
    spaceAfter=6,
)

body_no_indent = ParagraphStyle(
    name='BodyNoIndent',
    fontName='SimHei',
    fontSize=10.5,
    leading=18,
    alignment=TA_LEFT,
    wordWrap='CJK',
    spaceAfter=6,
)

bullet_style = ParagraphStyle(
    name='BulletStyle',
    fontName='SimHei',
    fontSize=10.5,
    leading=18,
    alignment=TA_LEFT,
    leftIndent=24,
    bulletIndent=12,
    wordWrap='CJK',
    spaceAfter=4,
)

code_style = ParagraphStyle(
    name='CodeStyle',
    fontName='SarasaMonoSC',
    fontSize=9,
    leading=14,
    alignment=TA_LEFT,
    leftIndent=18,
    wordWrap='CJK',
    spaceAfter=4,
    backColor=colors.HexColor('#F8F8F8'),
)

tbl_header_style = ParagraphStyle(
    name='TblHeader',
    fontName='SimHei',
    fontSize=10,
    leading=14,
    alignment=TA_CENTER,
    textColor=colors.white,
    wordWrap='CJK',
)

tbl_cell_style = ParagraphStyle(
    name='TblCell',
    fontName='SimHei',
    fontSize=9.5,
    leading=14,
    alignment=TA_CENTER,
    wordWrap='CJK',
)

tbl_cell_left = ParagraphStyle(
    name='TblCellLeft',
    fontName='SimHei',
    fontSize=9.5,
    leading=14,
    alignment=TA_LEFT,
    wordWrap='CJK',
)

caption_style = ParagraphStyle(
    name='CaptionStyle',
    fontName='SimHei',
    fontSize=9,
    leading=14,
    alignment=TA_CENTER,
    textColor=colors.HexColor('#555555'),
    spaceBefore=3,
    spaceAfter=6,
)

note_style = ParagraphStyle(
    name='NoteStyle',
    fontName='SimHei',
    fontSize=9.5,
    leading=16,
    alignment=TA_LEFT,
    leftIndent=18,
    textColor=colors.HexColor('#555555'),
    wordWrap='CJK',
    spaceAfter=4,
)


def add_heading(text, style, level=0):
    p = Paragraph(text, style)
    p.bookmark_name = text
    p.bookmark_level = level
    p.bookmark_text = text
    return p


def make_table(data, col_widths, num_header_rows=1):
    """Create a styled table with standard color scheme."""
    t = Table(data, colWidths=col_widths)
    style_cmds = [
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]
    for r in range(num_header_rows):
        style_cmds.append(('BACKGROUND', (0, r), (-1, r), TABLE_HEADER_COLOR))
        style_cmds.append(('TEXTCOLOR', (0, r), (-1, r), TABLE_HEADER_TEXT))
    for r in range(num_header_rows, len(data)):
        bg = TABLE_ROW_EVEN if (r - num_header_rows) % 2 == 0 else TABLE_ROW_ODD
        style_cmds.append(('BACKGROUND', (0, r), (-1, r), bg))
    t.setStyle(TableStyle(style_cmds))
    return t


# ============ Build Document ============
output_path = '/home/z/my-project/download/OpenClaw_Chat_Framework_Design_v2.pdf'

doc = TocDocTemplate(
    output_path,
    pagesize=A4,
    leftMargin=2.2*cm,
    rightMargin=2.2*cm,
    topMargin=2.5*cm,
    bottomMargin=2.5*cm,
    title='OpenClaw_Chat_Framework_Design_v2',
    author='Z.ai',
    creator='Z.ai',
    subject='OpenClaw encrypted chat system framework design - revised edition',
)

story = []
page_width = A4[0] - 4.4*cm

# ==================== COVER PAGE ====================
story.append(Spacer(1, 100))
story.append(Paragraph('<b>OpenClaw Chat</b>', cover_title_style))
story.append(Spacer(1, 18))
story.append(Paragraph('<b>加密聊天系统框架设计文档（修订版）</b>', cover_subtitle_style))
story.append(Spacer(1, 36))

desc_text = ('支持 <font name="Times New Roman">AI-AI</font> / <font name="Times New Roman">Human-Human</font> / '
             '<font name="Times New Roman">Human-AI</font> 三种通讯模式<br/>'
             '端到端加密 + 握手后 <font name="Times New Roman">P2P</font> 直连通信')
story.append(Paragraph(desc_text, cover_info_style))
story.append(Spacer(1, 60))
story.append(Paragraph('2026 年 4 月', cover_info_style))
story.append(PageBreak())

# ==================== TABLE OF CONTENTS ====================
toc = TableOfContents()
toc.levelStyles = [
    ParagraphStyle(name='TOC1', fontName='SimHei', fontSize=13, leftIndent=20, leading=22, spaceBefore=6, spaceAfter=4, wordWrap='CJK'),
    ParagraphStyle(name='TOC2', fontName='SimHei', fontSize=11, leftIndent=40, leading=18, spaceBefore=2, spaceAfter=2, wordWrap='CJK'),
    ParagraphStyle(name='TOC3', fontName='SimHei', fontSize=10, leftIndent=60, leading=16, spaceBefore=1, spaceAfter=1, wordWrap='CJK'),
]
story.append(Paragraph('<b>目 录</b>', ParagraphStyle(
    name='TOCTitle', fontName='Microsoft YaHei', fontSize=22, leading=32,
    alignment=TA_CENTER, spaceAfter=18, wordWrap='CJK'
)))
story.append(Spacer(1, 12))
story.append(toc)
story.append(PageBreak())

# ==================== 1. 项目概述 ====================
story.append(add_heading('<b>一、项目概述</b>', h1_style, 0))
story.append(Spacer(1, 8))

story.append(add_heading('<b>1.1 项目背景</b>', h2_style, 1))
story.append(Paragraph(
    '随着人工智能代理（<font name="Times New Roman">Agent</font>）技术的快速发展，<font name="Times New Roman">AI</font> 代理之间的安全通信需求日益增长。'
    '目前市面上的聊天工具主要面向人类用户设计，缺乏对 <font name="Times New Roman">AI-AI</font> 和 <font name="Times New Roman">Human-AI</font> '
    '混合通讯场景的原生支持。<font name="Times New Roman">OpenClaw Chat</font> 项目旨在构建一个基于 <font name="Times New Roman">OpenClaw</font> '
    '插件生态的加密聊天系统，填补这一领域的空白。',
    body_style
))
story.append(Paragraph(
    '本系统采用端到端加密（<font name="Times New Roman">E2EE</font>）方案，确保消息内容在传输过程中对服务器完全不可见。'
    '握手完成后的消息通信采用 <font name="Times New Roman">P2P</font> 直连模式，服务器不参与消息转发，从根本上保障了通信隐私。'
    '同时，系统设计遵循 OpenClaw 插件规范，通过 <font name="Times New Roman">Hook</font> 机制和 <font name="Times New Roman">Channel</font> '
    '注册实现与现有 <font name="Times New Roman">Agent</font> 生态的无缝集成。',
    body_style
))

story.append(add_heading('<b>1.2 核心目标</b>', h2_style, 1))
story.append(Paragraph(
    '本项目的设计目标围绕安全性、可扩展性和易用性三大维度展开。在安全性方面，采用 <font name="Times New Roman">Ed25519 + X25519 + '
    'AES-256-GCM</font> 加密套件，实现零知识服务器架构；在可扩展性方面，系统被拆分为三个完全独立的代码框架，便于独立开发、测试和部署；'
    '在易用性方面，通过 <font name="Times New Roman">6</font> 位数字临时号码和二维码扫码机制，大幅降低用户使用门槛。',
    body_style
))

goals = [
    ['<b>编号</b>', '<b>目标</b>', '<b>说明</b>'],
    ['G1', '端到端加密', '服务器零知识，仅负责握手协调，消息 P2P 直连传输'],
    ['G2', '多模式通讯', '原生支持 AI-AI、Human-Human、Human-AI 三种模式'],
    ['G3', '插件化集成', '遵循 OpenClaw 插件规范，通过 Hook/Channel 接入'],
    ['G4', '跨平台客户端', 'TypeScript 实现，可封装为 APK/iOS/WebView'],
    ['G5', '简化的好友系统', '6 位临时号码 + 200 人好友上限'],
]
goals_data = []
for row in goals:
    if row[0] == '<b>编号</b>':
        goals_data.append([
            Paragraph(row[0], tbl_header_style),
            Paragraph(row[1], tbl_header_style),
            Paragraph(row[2], tbl_header_style),
        ])
    else:
        goals_data.append([
            Paragraph(row[0], tbl_cell_style),
            Paragraph(row[1], tbl_cell_left),
            Paragraph(row[2], tbl_cell_left),
        ])
story.append(Spacer(1, 18))
story.append(make_table(goals_data, [1.2*cm, 3*cm, page_width - 4.2*cm]))
story.append(Spacer(1, 6))
story.append(Paragraph('表 1：核心设计目标', caption_style))
story.append(Spacer(1, 18))

story.append(add_heading('<b>1.3 通讯模式说明</b>', h2_style, 1))
story.append(Paragraph(
    '系统支持三种通讯模式，每种模式在底层协议层面统一处理，但在用户体验层面各有不同。'
    '<font name="Times New Roman">AI-AI</font> 模式下，两个 <font name="Times New Roman">OpenClaw Agent</font> '
    '通过插件自动完成握手和密钥交换，后续消息通过 <font name="Times New Roman">P2P</font> 直连传输，全程无需人工干预。'
    '<font name="Times New Roman">Human-Human</font> 模式下，两个自然人通过客户端应用建立加密通信通道，'
    '临时号码机制方便跨平台分享和添加好友。<font name="Times New Roman">Human-AI</font> 模式下，自然人通过客户端与 '
    '<font name="Times New Roman">OpenClaw Agent</font> 通信，人类客户端负责界面交互，<font name="Times New Roman">Agent</font> '
    '插件负责消息处理和加密运算。',
    body_style
))

# ==================== 2. 系统架构 ====================
story.append(add_heading('<b>二、系统架构</b>', h1_style, 0))
story.append(Spacer(1, 8))

story.append(add_heading('<b>2.1 三大独立框架</b>', h2_style, 1))
story.append(Paragraph(
    '系统被设计为三个完全独立的代码框架，每个框架拥有独立的代码仓库、构建系统和部署流程。'
    '这种解耦设计使得各组件可以独立演进和迭代，同时通过标准化的通信协议保持互操作性。'
    '三个框架之间通过明确定义的 <font name="Times New Roman">API</font> 接口和协议格式进行交互，'
    '不共享任何内部状态或数据库连接。',
    body_style
))

frameworks = [
    ['<b>框架</b>', '<b>技术栈</b>', '<b>职责</b>', '<b>部署方式</b>'],
    ['Server 服务', 'Node.js / TypeScript', '握手协调、号码分配、好友管理、P2P 发现', '云服务器 / Docker'],
    ['OpenClaw 插件', 'TypeScript (OpenClaw SDK)', '加密运算、密钥管理、Hook 拦截、Channel 注册', 'OpenClaw Agent 运行时'],
    ['Human 客户端', 'TypeScript (React Native / Web)', '聊天 UI、消息收发、二维码扫描、好友管理', 'APK / iOS / WebView'],
]
fw_data = []
for i, row in enumerate(frameworks):
    if i == 0:
        fw_data.append([Paragraph(c, tbl_header_style) for c in row])
    else:
        fw_data.append([Paragraph(row[0], tbl_cell_style), Paragraph(row[1], tbl_cell_style),
                         Paragraph(row[2], tbl_cell_left), Paragraph(row[3], tbl_cell_style)])
story.append(Spacer(1, 18))
story.append(make_table(fw_data, [2.5*cm, 3.5*cm, 5.5*cm, page_width - 11.5*cm]))
story.append(Spacer(1, 6))
story.append(Paragraph('表 2：三大框架概览', caption_style))
story.append(Spacer(1, 18))

story.append(add_heading('<b>2.2 通信流程架构</b>', h2_style, 1))
story.append(Paragraph(
    '系统采用"握手走服务器、消息走 <font name="Times New Roman">P2P</font>"的混合通信模型。'
    '在两个节点建立通信关系时，需要通过服务器完成身份验证和密钥交换握手。'
    '握手一旦完成，双方将获得彼此的 <font name="Times New Roman">P2P</font> 连接信息（如 <font name="Times New Roman">IP</font> '
    '地址、端口、<font name="Times New Roman">WebRTC</font> 信令等），后续所有消息通过 <font name="Times New Roman">P2P</font> '
    '直连传输，服务器不再参与消息中转。',
    body_style
))
story.append(Paragraph(
    '对于无法直接建立 <font name="Times New Roman">P2P</font> 连接的场景（如双方均位于严格 <font name="Times New Roman">NAT</font> '
    '之后），服务器提供有限的 <font name="Times New Roman">STUN/TURN</font> 中继辅助服务，但该中继仅传输加密后的密文数据，'
    '服务器依然无法解密消息内容，维持零知识架构的安全属性。',
    body_style
))

story.append(add_heading('<b>2.3 P2P 直连机制</b>', h2_style, 1))
story.append(Paragraph(
    '握手阶段完成后，通信双方进入 <font name="Times New Roman">P2P</font> 直连模式。系统采用 <font name="Times New Roman">WebRTC</font> '
    '技术实现 <font name="Times New Roman">NAT</font> 穿透和点对点连接建立。具体流程如下：首先，发起方通过 <font name="Times New Roman">STUN</font> '
    '服务器获取自身的公网地址映射；随后，通过服务器的信令通道交换 <font name="Times New Roman">SDP</font> '
    '描述信息（包含编解码能力和传输地址）；最后，双方尝试 <font name="Times New Roman">ICE</font> '
    '连通性检测，优先选择直连路径，仅在 <font name="Times New Roman">NAT</font> 穿透失败时回退到 '
    '<font name="Times New Roman">TURN</font> 中继。',
    body_style
))
story.append(Paragraph(
    '所有 <font name="Times New Roman">P2P</font> 通道上的消息均使用握手阶段协商的会话密钥进行 '
    '<font name="Times New Roman">AES-256-GCM</font> 加密。会话密钥通过 <font name="Times New Roman">HKDF-SHA256</font> '
    '从 <font name="Times New Roman">ECDH</font> 共享密钥派生，定期轮换以增强前向安全性（<font name="Times New Roman">PFS</font>）。'
    '每条消息包含唯一的 <font name="Times New Roman">nonce</font> 值，防止重放攻击。',
    body_style
))

# ==================== 3. Server 服务框架 ====================
story.append(add_heading('<b>三、Server 服务框架</b>', h1_style, 0))
story.append(Spacer(1, 8))

story.append(add_heading('<b>3.1 框架定位与职责</b>', h2_style, 1))
story.append(Paragraph(
    '<font name="Times New Roman">Server</font> 服务是整个系统的协调中心，但绝不是消息的中转站。'
    '其核心职责仅限于四个方面：第一，管理临时号码的分配和回收；第二，协调通信双方的握手流程；'
    '第三，提供 <font name="Times New Roman">P2P</font> 连接发现服务（<font name="Times New Roman">STUN/TURN</font>）；'
    '第四，维护好友关系的基础元数据。'
    '服务器在任何情况下都不会接触到消息的明文内容，也不会持有用户的私钥材料。',
    body_style
))

story.append(add_heading('<b>3.2 临时号码系统</b>', h2_style, 1))
story.append(Paragraph(
    '临时号码是本系统的核心社交机制，用于跨渠道分享身份以便添加好友。每个临时号码为 <font name="Times New Roman">6</font> '
    '位纯数字（范围 <font name="Times New Roman">100000 - 999999</font>），有效期 <font name="Times New Roman">24</font> '
    '小时。设计要点如下：',
    body_style
))
story.append(Paragraph('- 临时号码不限使用次数：同一号码可被多人使用来向该号码持有者发送好友请求', bullet_style))
story.append(Paragraph('- 好友总数上限：每个 Agent/用户的好友数量不超过 200 人', bullet_style))
story.append(Paragraph('- 过期自动回收：到期后号码从活跃池中移除，可被重新分配', bullet_style))
story.append(Paragraph('- 每次申请随机生成：同一用户每次申请获得不同的 6 位号码', bullet_style))
story.append(Spacer(1, 8))

story.append(Paragraph(
    '这种设计的优势在于，用户可以在社交场合将临时号码分享给多人，所有收到号码的人都可以在 '
    '<font name="Times New Roman">24</font> 小时内通过该号码发起好友请求。这极大地简化了社交场景中的好友添加流程。'
    '同时，好友总数不超过 <font name="Times New Roman">200</font> 人的限制有效防止了滥用和资源过度消耗。',
    body_style
))

story.append(add_heading('<b>3.3 握手协议流程</b>', h2_style, 1))
story.append(Paragraph(
    '握手协议是建立安全通信通道的核心流程，分为请求阶段和确认阶段两个步骤。整个握手过程通过服务器协调，'
    '但服务器仅传递加密的握手数据包，不参与密钥协商运算。握手完成后，双方获得对称会话密钥，可直接进入 '
    '<font name="Times New Roman">P2P</font> 通信模式。',
    body_style
))

story.append(add_heading('<b>3.3.1 阶段一：握手请求</b>', h3_style, 2))
story.append(Paragraph(
    '步骤 <font name="Times New Roman">1</font>：请求方（<font name="Times New Roman">A</font>）向服务器发起握手请求，'
    '携带目标方的临时号码和自身的身份公钥。',
    body_style
))
story.append(Paragraph(
    '步骤 <font name="Times New Roman">2</font>：服务器验证临时号码的有效性，将握手请求转发至目标方'
    '（<font name="Times New Roman">B</font>）。服务器仅传递 <font name="Times New Roman">A</font> '
    '的公钥和握手元数据，不暴露 <font name="Times New Roman">A</font> 的真实身份信息。',
    body_style
))
story.append(Paragraph(
    '步骤 <font name="Times New Roman">3</font>：<font name="Times New Roman">B</font> 收到请求后，'
    '生成 <font name="Times New Roman">ECDH</font> 临时密钥对，使用 <font name="Times New Roman">A</font> '
    '的公钥加密自身的临时公钥，将加密后的握手响应返回服务器。',
    body_style
))

story.append(add_heading('<b>3.3.2 阶段二：握手确认</b>', h3_style, 2))
story.append(Paragraph(
    '步骤 <font name="Times New Roman">4</font>：服务器将 <font name="Times New Roman">B</font> '
    '的加密握手响应转发给 <font name="Times New Roman">A</font>。',
    body_style
))
story.append(Paragraph(
    '步骤 <font name="Times New Roman">5</font>：<font name="Times New Roman">A</font> 解密获得 '
    '<font name="Times New Roman">B</font> 的临时公钥，计算共享密钥，派生会话密钥，然后使用会话密钥加密确认消息返回服务器。',
    body_style
))
story.append(Paragraph(
    '步骤 <font name="Times New Roman">6</font>：服务器将加密确认消息转发给 <font name="Times New Roman">B</font>。'
    '<font name="Times New Roman">B</font> 独立派生出相同的会话密钥并验证确认消息。验证通过后，'
    '双方均获得共享的会话密钥，握手完成。',
    body_style
))
story.append(Paragraph(
    '步骤 <font name="Times New Roman">7</font>：双方通过服务器的 <font name="Times New Roman">P2P</font> '
    '发现服务交换连接地址信息，建立 <font name="Times New Roman">WebRTC</font> 直连通道，后续消息不再经过服务器。',
    body_style
))

story.append(add_heading('<b>3.4 P2P 发现服务</b>', h2_style, 1))
story.append(Paragraph(
    '服务器内嵌 <font name="Times New Roman">STUN/TURN</font> 服务，用于协助 <font name="Times New Roman">P2P</font> '
    '连接的建立。<font name="Times New Roman">STUN</font> 服务器帮助客户端发现自己的公网 <font name="Times New Roman">IP</font> '
    '地址和 <font name="Times New Roman">NAT</font> 类型；<font name="Times New Roman">TURN</font> '
    '服务器在 <font name="Times New Roman">NAT</font> 穿透失败时提供中继通道。服务器的 <font name="Times New Roman">WebRTC</font> '
    '信令通道负责交换 <font name="Times New Roman">SDP</font> offer/answer 和 <font name="Times New Roman">ICE</font> '
    '候选地址。这些信令数据虽然是明文传输的，但不包含任何消息内容或密钥材料，仅用于连接建立。',
    body_style
))

story.append(add_heading('<b>3.5 核心 API 接口</b>', h2_style, 1))

apis = [
    ['<b>接口</b>', '<b>方法</b>', '<b>说明</b>'],
    ['/api/v1/temp-number/request', 'POST', '申请 6 位临时号码（24h 有效）'],
    ['/api/v1/temp-number/resolve', 'GET', '通过号码查询对应节点的公钥信息'],
    ['/api/v1/handshake/initiate', 'POST', '发起握手请求'],
    ['/api/v1/handshake/respond', 'POST', '提交握手响应'],
    ['/api/v1/handshake/confirm', 'POST', '提交握手确认'],
    ['/api/v1/p2p/signal', 'POST', 'WebRTC 信令交换'],
    ['/api/v1/p2p/stun', 'GET', 'STUN 绑定请求'],
    ['/api/v1/friends/list', 'GET', '获取好友列表'],
    ['/api/v1/friends/remove', 'DELETE', '移除好友关系'],
]
api_data = []
for i, row in enumerate(apis):
    if i == 0:
        api_data.append([Paragraph(c, tbl_header_style) for c in row])
    else:
        api_data.append([
            Paragraph('<font name="SarasaMonoSC">' + row[0] + '</font>', tbl_cell_left),
            Paragraph(row[1], tbl_cell_style),
            Paragraph(row[2], tbl_cell_left),
        ])
story.append(Spacer(1, 18))
story.append(make_table(api_data, [5.5*cm, 2*cm, page_width - 7.5*cm]))
story.append(Spacer(1, 6))
story.append(Paragraph('表 3：Server 核心 API 列表', caption_style))
story.append(Spacer(1, 18))

# ==================== 4. OpenClaw 插件框架 ====================
story.append(add_heading('<b>四、OpenClaw 插件框架</b>', h1_style, 0))
story.append(Spacer(1, 8))

story.append(add_heading('<b>4.1 插件定位与职责</b>', h2_style, 1))
story.append(Paragraph(
    'OpenClaw 插件是 <font name="Times New Roman">AI Agent</font> 侧的核心组件，以标准 '
    '<font name="Times New Roman">OpenClaw</font> 插件形式运行在 <font name="Times New Roman">Agent</font> '
    '宿主进程中。插件负责所有加密运算操作、密钥生命周期管理、以及通过 <font name="Times New Roman">OpenClaw</font> '
    '提供的 <font name="Times New Roman">Hook</font> 机制和 <font name="Times New Roman">Channel</font> '
    '接口实现与宿主 <font name="Times New Roman">Agent</font> 的消息互通。',
    body_style
))

story.append(add_heading('<b>4.2 插件清单文件</b>', h2_style, 1))
story.append(Paragraph(
    '遵循 <font name="Times New Roman">OpenClaw</font> 插件规范，插件根目录包含 '
    '<font name="Times New Roman">openclaw.plugin.json</font> 清单文件，声明插件元数据、'
    '注册的 <font name="Times New Roman">Channel</font>、<font name="Times New Roman">Tool</font>、'
    '<font name="Times New Roman">Hook</font> 和 <font name="Times New Roman">Service</font>，以及配置项 '
    '<font name="Times New Roman">Schema</font>。示例结构如下：',
    body_style
))

story.append(Spacer(1, 8))
manifest_code = ('{<br/>'
                 '  "name": "openclaw-chat",<br/>'
                 '  "version": "1.0.0",<br/>'
                 '  "description": "E2EE chat plugin for OpenClaw agents",<br/>'
                 '  "channels": [{ "name": "encrypted-chat" }],<br/>'
                 '  "tools": [{ "name": "chat-friend" }, { "name": "chat-send" }],<br/>'
                 '  "hooks": [{ "event": "message_sending" }, { "event": "before_tool_call" }],<br/>'
                 '  "services": [{ "name": "identity-service" }],<br/>'
                 '  "configSchema": { ... }<br/>'
                 '}')
story.append(Paragraph(manifest_code, code_style))
story.append(Spacer(1, 8))

story.append(add_heading('<b>4.3 Channel 注册</b>', h2_style, 1))
story.append(Paragraph(
    '通过 <font name="Times New Roman">api.registerChannel("encrypted-chat")</font> 注册加密聊天通道。'
    '该通道作为 <font name="Times New Roman">Agent</font> 通信的入口，接收来自其他 <font name="Times New Roman">Agent</font> '
    '或人类客户端的加密消息。通道处理器负责消息解密、格式转换和将明文消息传递给 <font name="Times New Roman">Agent</font> '
    '的对话引擎。同时，通道还负责将 <font name="Times New Roman">Agent</font> 的响应消息加密后发送给目标节点。',
    body_style
))

story.append(add_heading('<b>4.4 Tool 注册</b>', h2_style, 1))
story.append(Paragraph(
    '插件注册两个核心 <font name="Times New Roman">Tool</font>，供 <font name="Times New Roman">Agent</font> 在对话中调用：',
    body_style
))

tools_info = [
    ['<b>Tool</b>', '<b>功能</b>', '<b>参数</b>'],
    ['chat-friend', '好友管理', 'action: add/list/remove, target: 临时号或 ID'],
    ['chat-send', '发送加密消息', 'target: 好友 ID, message: 消息内容'],
]
tools_data = []
for i, row in enumerate(tools_info):
    if i == 0:
        tools_data.append([Paragraph(c, tbl_header_style) for c in row])
    else:
        tools_data.append([Paragraph('<font name="Times New Roman">' + row[0] + '</font>', tbl_cell_style),
                           Paragraph(row[1], tbl_cell_left),
                           Paragraph(row[2], tbl_cell_left)])
story.append(Spacer(1, 18))
story.append(make_table(tools_data, [3*cm, 3.5*cm, page_width - 6.5*cm]))
story.append(Spacer(1, 6))
story.append(Paragraph('表 4：插件注册的 Tool 列表', caption_style))
story.append(Spacer(1, 18))

story.append(add_heading('<b>4.5 Hook 机制</b>', h2_style, 1))
story.append(Paragraph(
    '插件通过 <font name="Times New Roman">Hook</font> 机制实现消息发送拦截和权限校验，这是 '
    '<font name="Times New Roman">OpenClaw</font> 插件体系的核心能力之一。',
    body_style
))

story.append(Paragraph(
    '<b><font name="Times New Roman">message_sending</font> Hook</b>：拦截所有通过加密聊天通道发出的消息。'
    '在消息发送前，自动调用加密模块对明文进行 <font name="Times New Roman">AES-256-GCM</font> 加密，'
    '并附加消息签名（<font name="Times New Roman">Ed25519</font>）。接收端通过同一通道收到消息时，'
    '自动验证签名并解密，将明文传递给 <font name="Times New Roman">Agent</font> 的对话引擎。'
    '整个加解密过程对 <font name="Times New Roman">Agent</font> 完全透明。',
    body_style
))
story.append(Paragraph(
    '<b><font name="Times New Roman">before_tool_call</font> Hook</b>：在 <font name="Times New Roman">Agent</font> '
    '调用 <font name="Times New Roman">chat-send</font> 或 <font name="Times New Roman">chat-friend</font> '
    '工具前，执行权限校验。检查目标是否在好友列表中、消息内容是否符合安全策略等。'
    '对于未建立好友关系的节点，自动拒绝消息发送并提示 <font name="Times New Roman">Agent</font> '
    '先建立好友关系。同时检查好友总数是否已达到 <font name="Times New Roman">200</font> 人上限。',
    body_style
))

story.append(add_heading('<b>4.6 身份与密钥管理</b>', h2_style, 1))
story.append(Paragraph(
    '插件为每个 <font name="Times New Roman">Agent</font> 维护一套完整的身份凭证体系：',
    body_style
))
story.append(Paragraph(
    '- <b>长期身份密钥对</b>：<font name="Times New Roman">Ed25519</font> 签名密钥对，用于身份验证和消息签名。'
    '插件初始化时自动生成，持久化存储在 <font name="Times New Roman">Agent</font> 的安全存储中。'
    '对应派生的 <font name="Times New Roman">X25519</font> 密钥用于静态密钥交换。',
    bullet_style
))
story.append(Paragraph(
    '- <b>临时会话密钥对</b>：每次握手时动态生成的 <font name="Times New Roman">X25519</font> '
    '密钥对，用于前向安全性保障。握手完成后临时私钥即被销毁。',
    bullet_style
))
story.append(Paragraph(
    '- <b>会话密钥</b>：通过 <font name="Times New Roman">HKDF-SHA256</font> 从 '
    '<font name="Times New Roman">ECDH</font> 共享密钥派生的 <font name="Times New Roman">AES-256</font> '
    '对称密钥，用于消息加解密。支持定期轮换（建议 <font name="Times New Roman">100</font> 条消息或 '
    '<font name="Times New Roman">1</font> 小时轮换一次）。',
    bullet_style
))

story.append(add_heading('<b>4.7 二维码私钥导出</b>', h2_style, 1))
story.append(Paragraph(
    '每个 <font name="Times New Roman">Agent</font> 的私钥可以通过二维码导出，供人类用户扫描获取。'
    '二维码中编码的私钥数据使用密码保护（<font name="Times New Roman">PBKDF2</font> 加密），'
    '扫描后需要输入预设密码才能解密获得私钥明文。获得私钥即获得该 <font name="Times New Roman">Agent</font> '
    '的全权通讯和好友管理权限。二维码有效期为 <font name="Times New Roman">60</font> 秒，超时后需重新生成。',
    body_style
))
story.append(Paragraph(
    '安全注意事项：二维码展示期间，屏幕上会显示倒计时；二维码分辨率设置为最低可用等级，防止远距离偷拍；'
    '同一私钥导出操作在短时间内（<font name="Times New Roman">5</font> 分钟）限制为 <font name="Times New Roman">3</font> 次，'
    '防止暴力扫描。',
    body_style
))

# ==================== 5. Human 客户端框架 ====================
story.append(add_heading('<b>五、Human 客户端框架</b>', h1_style, 0))
story.append(Spacer(1, 8))

story.append(add_heading('<b>5.1 技术选型</b>', h2_style, 1))
story.append(Paragraph(
    '客户端采用 <font name="Times New Roman">TypeScript</font> 作为主要开发语言，使用 '
    '<font name="Times New Roman">React Native</font> 框架构建跨平台移动应用，同时支持打包为 '
    '<font name="Times New Roman">WebView</font> 容器加载的 <font name="Times New Roman">Web</font> '
    '应用。核心加密运算库与插件共享同一套 <font name="Times New Roman">TypeScript</font> 实现，'
    '确保客户端与 <font name="Times New Roman">Agent</font> 端的加密行为完全一致。',
    body_style
))

client_tech = [
    ['<b>层次</b>', '<b>技术方案</b>', '<b>说明</b>'],
    ['UI 框架', 'React Native', '一套代码运行在 Android / iOS / Web 三端'],
    ['加密库', '@openclaw-chat/crypto (共享)', '与插件共用相同的 TypeScript 加密实现'],
    ['P2P 通信', 'WebRTC', '浏览器/移动端原生支持，NAT 穿透'],
    ['状态管理', 'Zustand', '轻量级，支持好友列表和会话状态'],
    ['本地存储', 'SQLite (react-native-sqlite)', '消息缓存和好友数据持久化'],
    ['打包方案', 'Capacitor / EAS Build', '封装为 APK / iOS / WebView'],
]
client_data = []
for i, row in enumerate(client_tech):
    if i == 0:
        client_data.append([Paragraph(c, tbl_header_style) for c in row])
    else:
        client_data.append([Paragraph(row[0], tbl_cell_style), Paragraph('<font name="Times New Roman">' + row[1] + '</font>', tbl_cell_style),
                            Paragraph(row[2], tbl_cell_left)])
story.append(Spacer(1, 18))
story.append(make_table(client_data, [2.5*cm, 5*cm, page_width - 7.5*cm]))
story.append(Spacer(1, 6))
story.append(Paragraph('表 5：客户端技术选型', caption_style))
story.append(Spacer(1, 18))

story.append(add_heading('<b>5.2 核心功能模块</b>', h2_style, 1))

story.append(Paragraph(
    '<b>聊天界面模块</b>：提供类似主流即时通讯应用的聊天界面，支持文字消息、表情和图片附件。'
    '消息气泡区分发送方和接收方，已读回执和在线状态指示器增强用户体验。'
    '对于 <font name="Times New Roman">Human-AI</font> 模式，消息以对话形式展示，并支持 '
    '<font name="Times New Roman">Agent</font> 正在输入的状态提示。',
    body_style
))
story.append(Paragraph(
    '<b>好友管理模块</b>：支持通过 <font name="Times New Roman">6</font> 位临时号码添加好友，'
    '也支持扫码添加（扫描对方的临时号码二维码）。好友列表展示好友的在线状态和最后活跃时间。'
    '支持好友备注名设置和好友移除操作。好友总数上限为 <font name="Times New Roman">200</font> '
    '人，界面会在接近上限时给出提醒。',
    body_style
))
story.append(Paragraph(
    '<b>临时号码模块</b>：一键申请 <font name="Times New Roman">6</font> 位临时号码，'
    '支持生成临时号码二维码便于分享。号码列表展示所有活跃号码及其到期倒计时。'
    '支持手动提前作废不再需要的号码。',
    body_style
))
story.append(Paragraph(
    '<b>二维码扫描模块</b>：集成摄像头扫描功能，支持扫描临时号码二维码和私钥导出二维码。'
    '扫描私钥二维码后，需要输入密码验证才能完成导入，导入后自动切换为该身份的通讯权限。',
    body_style
))
story.append(Paragraph(
    '<b>设置与安全模块</b>：密钥对管理（查看公钥指纹、重新生成密钥对、导出私钥二维码）、'
    '会话密钥轮换策略配置、通知偏好设置、数据清除功能。',
    body_style
))

# ==================== 6. 加密方案 ====================
story.append(add_heading('<b>六、加密方案</b>', h1_style, 0))
story.append(Spacer(1, 8))

story.append(add_heading('<b>6.1 加密套件总览</b>', h2_style, 1))
story.append(Paragraph(
    '系统采用混合加密方案，结合非对称加密和对称加密的优势。非对称加密用于密钥交换和身份验证，'
    '对称加密用于消息内容的快速加解密。所有加密算法均选用业界标准的、经过广泛审计的实现库。',
    body_style
))

crypto_suite = [
    ['<b>组件</b>', '<b>算法</b>', '<b>用途</b>'],
    ['签名算法', 'Ed25519', '消息签名与身份验证'],
    ['密钥交换', 'X25519 (ECDH)', '握手阶段的共享密钥协商'],
    ['消息加密', 'AES-256-GCM', '消息内容的对称加密'],
    ['密钥派生', 'HKDF-SHA256', '从 ECDH 共享密钥派生会话密钥'],
    ['密码加密', 'PBKDF2-SHA256', '二维码私钥的密码保护'],
    ['哈希算法', 'SHA-256', '密钥指纹和数据完整性校验'],
]
crypto_data = []
for i, row in enumerate(crypto_suite):
    if i == 0:
        crypto_data.append([Paragraph(c, tbl_header_style) for c in row])
    else:
        crypto_data.append([Paragraph(row[0], tbl_cell_style),
                            Paragraph('<font name="Times New Roman">' + row[1] + '</font>', tbl_cell_style),
                            Paragraph(row[2], tbl_cell_left)])
story.append(Spacer(1, 18))
story.append(make_table(crypto_data, [2.5*cm, 4*cm, page_width - 6.5*cm]))
story.append(Spacer(1, 6))
story.append(Paragraph('表 6：加密套件总览', caption_style))
story.append(Spacer(1, 18))

story.append(add_heading('<b>6.2 密钥层次结构</b>', h2_style, 1))
story.append(Paragraph(
    '系统的密钥层次分为三层。最底层是长期身份密钥，由 <font name="Times New Roman">Ed25519</font> '
    '签名密钥对和对应的 <font name="Times New Roman">X25519</font> 加密密钥对组成，在插件/客户端'
    '初始化时一次性生成，长期有效。中间层是握手临时密钥，每次握手时动态生成 '
    '<font name="Times New Roman">X25519</font> 密钥对，提供前向安全性。最上层是会话密钥，'
    '通过 <font name="Times New Roman">HKDF-SHA256</font> 从 <font name="Times New Roman">ECDH</font> '
    '共享密钥派生，用于实际的消息加解密，支持定期轮换。',
    body_style
))

story.append(add_heading('<b>6.3 消息加密格式</b>', h2_style, 1))
story.append(Paragraph(
    '每条加密消息的二进制格式如下：版本号（<font name="Times New Roman">1</font> 字节）+ 发送者公钥指纹'
    '（<font name="Times New Roman">32</font> 字节）+ <font name="Times New Roman">nonce</font>'
    '（<font name="Times New Roman">12</font> 字节）+ 密文 + 认证标签（<font name="Times New Roman">16</font> 字节）'
    '+ <font name="Times New Roman">Ed25519</font> 签名（<font name="Times New Roman">64</font> 字节）。'
    '接收端首先验证签名确认发送者身份，然后使用会话密钥和 <font name="Times New Roman">nonce</font> 解密密文，'
    '最后校验 <font name="Times New Roman">GCM</font> 认证标签确保消息完整性。',
    body_style
))

# ==================== 7. 好友系统设计 ====================
story.append(add_heading('<b>七、好友系统设计</b>', h1_style, 0))
story.append(Spacer(1, 8))

story.append(add_heading('<b>7.1 好友关系模型</b>', h2_style, 1))
story.append(Paragraph(
    '好友关系是双向对称的，双方握手成功后即自动建立好友关系。好友关系的基础信息（双方公钥指纹、'
    '建立时间、最新会话密钥元数据）存储在各自的本地数据库中，服务器仅维护一个轻量级的好友存在性记录，'
    '用于防止重复握手和辅助离线消息投递。',
    body_style
))

story.append(add_heading('<b>7.2 临时号码添加流程</b>', h2_style, 1))
story.append(Paragraph(
    '用户 <font name="Times New Roman">A</font> 想添加用户 <font name="Times New Roman">B</font> 为好友时，'
    '操作流程如下：<font name="Times New Roman">B</font> 首先在应用中申请一个 <font name="Times New Roman">6</font> '
    '位临时号码，可以通过任意渠道（微信、短信、面对面等）分享给 <font name="Times New Roman">A</font>。'
    '<font name="Times New Roman">A</font> 在自己的应用中输入该 <font name="Times New Roman">6</font> '
    '位号码，应用自动向服务器发起好友请求（即握手请求）。如果 <font name="Times New Roman">B</font> 在线，'
    '会实时收到请求通知并自动或手动确认；如果 <font name="Times New Roman">B</font> 离线，'
    '请求会排队等待 <font name="Times New Roman">B</font> 上线后处理。',
    body_style
))
story.append(Paragraph(
    '由于临时号码不限使用次数，<font name="Times New Roman">B</font> 可以将同一个 <font name="Times New Roman">6</font> '
    '位号码分享给多个用户，他们都可在 <font name="Times New Roman">24</font> 小时有效期内发起好友请求。'
    '当 <font name="Times New Roman">B</font> 的好友总数达到 <font name="Times New Roman">200</font> '
    '人上限时，所有新的好友请求将被拒绝，直到 <font name="Times New Roman">B</font> 主动移除部分好友释放名额。',
    body_style
))

story.append(add_heading('<b>7.3 好友数量限制</b>', h2_style, 1))
story.append(Paragraph(
    '每个节点（<font name="Times New Roman">Agent</font> 或人类用户）的好友总数上限为 '
    '<font name="Times New Roman">200</font> 人。该限制在服务端和客户端双重校验：'
    '服务端在处理握手请求时检查目标方的好友计数，客户端在发送好友请求前预先检查。'
    '当好友数量达到 <font name="Times New Roman">180</font> 人时，客户端界面会显示黄色预警；'
    '达到 <font name="Times New Roman">200</font> 人时，添加好友按钮变灰不可用。'
    '这一限制的目的是防止资源滥用、控制加密会话密钥的管理开销，以及在合理的范围内维护社交网络质量。',
    body_style
))

# ==================== 8. 代码仓库结构 ====================
story.append(add_heading('<b>八、代码仓库结构</b>', h1_style, 0))
story.append(Spacer(1, 8))

story.append(Paragraph(
    '三个独立框架各自拥有独立的代码仓库，仓库结构设计如下。每个仓库都包含完整的开发工具链配置、'
    '测试框架和部署脚本，可以独立进行开发、测试和发布。',
    body_style
))

story.append(add_heading('<b>8.1 openclaw-chat-server</b>', h2_style, 1))
server_code = ('openclaw-chat-server/<br/>'
               '  src/<br/>'
               '    api/             // REST API 路由<br/>'
               '    services/          // 业务逻辑层<br/>'
               '      tempNumber.ts  // 临时号码管理<br/>'
               '      handshake.ts  // 握手协议处理<br/>'
               '      p2pDiscovery.ts // P2P 发现/STUN/TURN<br/>'
               '      friendship.ts  // 好友关系管理<br/>'
               '    models/          // 数据模型<br/>'
               '    db/              // 数据库层<br/>'
               '    middleware/        // 中间件(限流、鉴权)<br/>'
               '  Dockerfile<br/>'
               '  docker-compose.yml')
story.append(Paragraph(server_code, code_style))
story.append(Spacer(1, 12))

story.append(add_heading('<b>8.2 openclaw-chat-plugin</b>', h2_style, 1))
plugin_code = ('openclaw-chat-plugin/<br/>'
               '  openclaw.plugin.json  // 插件清单<br/>'
               '  src/<br/>'
               '    index.ts         // 插件入口<br/>'
               '    channels/<br/>'
               '      encryptedChat.ts // 加密通道处理器<br/>'
               '    tools/<br/>'
               '      chatFriend.ts   // 好友管理工具<br/>'
               '      chatSend.ts     // 消息发送工具<br/>'
               '    hooks/<br/>'
               '      messageSending.ts // 消息发送拦截<br/>'
               '      beforeToolCall.ts // 工具调用权限校验<br/>'
               '    crypto/<br/>'
               '      keyManager.ts  // 密钥生命周期管理<br/>'
               '      keyExchange.ts  // ECDH 密钥交换<br/>'
               '      cipher.ts       // AES-256-GCM 加解密<br/>'
               '      signer.ts       // Ed25519 签名验签<br/>'
               '    services/<br/>'
               '      identityService.ts // 身份服务')
story.append(Paragraph(plugin_code, code_style))
story.append(Spacer(1, 12))

story.append(add_heading('<b>8.3 openclaw-chat-client</b>', h2_style, 1))
client_code = ('openclaw-chat-client/<br/>'
               '  src/<br/>'
               '    App.tsx<br/>'
               '    screens/<br/>'
               '      ChatScreen.tsx    // 聊天界面<br/>'
               '      FriendListScreen.tsx // 好友列表<br/>'
               '      TempNumberScreen.tsx // 临时号码管理<br/>'
               '      QRScanScreen.tsx   // 二维码扫描<br/>'
               '      SettingsScreen.tsx   // 设置<br/>'
               '    store/             // Zustand 状态<br/>'
               '    crypto/            // 共享加密库<br/>'
               '    p2p/              // WebRTC P2P<br/>'
               '    services/          // API 客户端<br/>'
               '  capacitor.config.ts // 多平台打包配置')
story.append(Paragraph(client_code, code_style))
story.append(Spacer(1, 18))

# ==================== 9. 实施计划 ====================
story.append(add_heading('<b>九、实施计划</b>', h1_style, 0))
story.append(Spacer(1, 8))

story.append(Paragraph(
    '整个项目分为四个阶段实施，各阶段并行推进以缩短总体交付周期。第一阶段完成加密基础设施和服务器核心功能，'
    '为后续开发奠定安全基础；第二阶段实现插件和客户端的基础通信能力；第三阶段完善好友系统和社交功能；'
    '第四阶段进行跨平台适配和安全审计。',
    body_style
))

plan_data_rows = [
    ['<b>阶段</b>', '<b>内容</b>', '<b>交付物</b>'],
    ['P1：基础设施', '加密库开发、服务器框架搭建、临时号码系统', '共享加密库 + Server MVP'],
    ['P2：通信核心', '握手协议实现、P2P 连接、插件 Channel/Hook 注册', '插件 + 客户端通信 Demo'],
    ['P3：社交功能', '好友系统、二维码、临时号码 UI、消息收发', '完整功能客户端'],
    ['P4：多端适配', 'APK/iOS/WebView 打包、安全审计、性能优化', '三端发布包'],
]
plan_data = []
for i, row in enumerate(plan_data_rows):
    if i == 0:
        plan_data.append([Paragraph(c, tbl_header_style) for c in row])
    else:
        plan_data.append([Paragraph(row[0], tbl_cell_style),
                           Paragraph(row[1], tbl_cell_left),
                           Paragraph(row[2], tbl_cell_left)])
story.append(Spacer(1, 18))
story.append(make_table(plan_data, [3*cm, 5.5*cm, page_width - 8.5*cm]))
story.append(Spacer(1, 6))
story.append(Paragraph('表 7：实施计划总览', caption_style))
story.append(Spacer(1, 18))

# ==================== 10. 安全考量 ====================
story.append(add_heading('<b>十、安全考量</b>', h1_style, 0))
story.append(Spacer(1, 8))

story.append(add_heading('<b>10.1 零知识服务器</b>', h2_style, 1))
story.append(Paragraph(
    '服务器的零知识属性是本系统最核心的安全特性。在整个握手流程中，服务器仅充当信使角色，'
    '传递双方公钥和加密的握手数据包，无法获知最终的会话密钥。握手完成后，消息通过 '
    '<font name="Times New Roman">P2P</font> 直连传输，服务器完全不参与。即使服务器被完全攻陷，'
    '攻击者也只能获取通信元数据（谁与谁握过手、握手时间等），无法解密任何历史或未来消息。',
    body_style
))

story.append(add_heading('<b>10.2 前向安全性</b>', h2_style, 1))
story.append(Paragraph(
    '系统通过握手临时密钥机制实现前向安全性（<font name="Times New Roman">PFS</font>）。'
    '每次握手都生成全新的 <font name="Times New Roman">X25519</font> 临时密钥对，'
    '握手完成后临时私钥即被安全销毁。即使长期身份私钥在未来被泄露，'
    '攻击者也无法解密之前的通信内容，因为会话密钥的派生依赖于已销毁的临时私钥。'
    '此外，会话密钥定期轮换机制进一步限制了单个密钥泄露的影响范围。',
    body_style
))

story.append(add_heading('<b>10.3 二维码安全</b>', h2_style, 1))
story.append(Paragraph(
    '私钥导出二维码采用多层安全保护。首先，私钥在编码为二维码前使用 '
    '<font name="Times New Roman">PBKDF2-SHA256</font>（迭代次数 <font name="Times New Roman">100,000</font>）'
    '和用户预设密码进行加密，即使二维码被截获，没有密码也无法解密。'
    '其次，二维码有效期为 <font name="Times New Roman">60</font> 秒，窗口期极短。'
    '最后，短时间内重复导出操作被限制为 <font name="Times New Roman">3</font> 次，'
    '配合低分辨率二维码渲染，降低被远距离偷拍的风险。',
    body_style
))

story.append(add_heading('<b>10.4 临时号码安全</b>', h2_style, 1))
story.append(Paragraph(
    '临时号码本身不包含任何身份信息，仅作为服务器端的路由标识。服务器的号码分配采用密码学安全的随机数生成器'
    '（<font name="Times New Roman">CSPRNG</font>），号码空间为 <font name="Times New Roman">900,000</font>'
    '（<font name="Times New Roman">100000-999999</font>），配合 <font name="Times New Roman">24</font> '
    '小时自动过期机制，号码碰撞和穷举攻击的概率极低。临时号码不限使用次数的设计虽然方便了社交分享，'
    '但每次好友请求仍需完整的握手验证，不会降低通信安全性。',
    body_style
))

# ==================== Build PDF ====================
doc.multiBuild(story)
print(f"PDF generated: {output_path}")
