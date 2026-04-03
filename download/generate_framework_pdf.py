# -*- coding: utf-8 -*-
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.lib.units import cm, inch
from reportlab.lib import colors
from reportlab.platypus import (
    Paragraph, Spacer, PageBreak, Table, TableStyle,
    SimpleDocTemplate, KeepTogether
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

# ============================================================
# Font Registration
# ============================================================
pdfmetrics.registerFont(TTFont('Microsoft YaHei', '/usr/share/fonts/truetype/chinese/msyh.ttf'))
pdfmetrics.registerFont(TTFont('SimHei', '/usr/share/fonts/truetype/chinese/SimHei.ttf'))
pdfmetrics.registerFont(TTFont('Times New Roman', '/usr/share/fonts/truetype/english/Times-New-Roman.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'))
pdfmetrics.registerFont(TTFont('SarasaMonoSC', '/usr/share/fonts/truetype/chinese/SarasaMonoSC-Regular.ttf'))

registerFontFamily('Microsoft YaHei', normal='Microsoft YaHei', bold='Microsoft YaHei')
registerFontFamily('SimHei', normal='SimHei', bold='SimHei')
registerFontFamily('Times New Roman', normal='Times New Roman', bold='Times New Roman')
registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSans')

# ============================================================
# Color Scheme
# ============================================================
TABLE_HEADER_COLOR = colors.HexColor('#1F4E79')
TABLE_HEADER_TEXT = colors.white
TABLE_ROW_EVEN = colors.white
TABLE_ROW_ODD = colors.HexColor('#F5F5F5')
ACCENT_COLOR = colors.HexColor('#2E86C1')

# ============================================================
# Styles
# ============================================================
cover_title_style = ParagraphStyle(
    name='CoverTitle', fontName='Microsoft YaHei', fontSize=36,
    leading=48, alignment=TA_CENTER, spaceAfter=24, textColor=colors.HexColor('#1A3A5C')
)
cover_subtitle_style = ParagraphStyle(
    name='CoverSubtitle', fontName='SimHei', fontSize=18,
    leading=26, alignment=TA_CENTER, spaceAfter=36, textColor=colors.HexColor('#2E86C1')
)
cover_author_style = ParagraphStyle(
    name='CoverAuthor', fontName='SimHei', fontSize=13,
    leading=22, alignment=TA_CENTER, spaceAfter=12
)

h1_style = ParagraphStyle(
    name='H1', fontName='Microsoft YaHei', fontSize=20,
    leading=28, spaceBefore=18, spaceAfter=10, textColor=colors.HexColor('#1A3A5C')
)
h2_style = ParagraphStyle(
    name='H2', fontName='Microsoft YaHei', fontSize=15,
    leading=22, spaceBefore=14, spaceAfter=8, textColor=colors.HexColor('#2E86C1')
)
h3_style = ParagraphStyle(
    name='H3', fontName='SimHei', fontSize=12,
    leading=18, spaceBefore=10, spaceAfter=6, textColor=colors.HexColor('#34495E')
)
body_style = ParagraphStyle(
    name='Body', fontName='SimHei', fontSize=10.5,
    leading=18, alignment=TA_LEFT, firstLineIndent=21,
    wordWrap='CJK', spaceAfter=4
)
body_no_indent = ParagraphStyle(
    name='BodyNoIndent', fontName='SimHei', fontSize=10.5,
    leading=18, alignment=TA_LEFT, wordWrap='CJK', spaceAfter=4
)
code_style = ParagraphStyle(
    name='Code', fontName='SarasaMonoSC', fontSize=9,
    leading=14, alignment=TA_LEFT, wordWrap='CJK',
    leftIndent=20, rightIndent=20, spaceAfter=4, spaceBefore=4,
    backColor=colors.HexColor('#F4F6F8'), borderPadding=6
)
bullet_style = ParagraphStyle(
    name='Bullet', fontName='SimHei', fontSize=10.5,
    leading=18, alignment=TA_LEFT, leftIndent=24,
    bulletIndent=12, wordWrap='CJK', spaceAfter=3
)
toc_h1 = ParagraphStyle(name='TOCH1', fontName='SimHei', fontSize=13, leftIndent=20, leading=22)
toc_h2 = ParagraphStyle(name='TOCH2', fontName='SimHei', fontSize=11, leftIndent=40, leading=18)

# Table styles
tbl_header_style = ParagraphStyle(
    name='TblHeader', fontName='SimHei', fontSize=10,
    leading=14, alignment=TA_CENTER, textColor=colors.white, wordWrap='CJK'
)
tbl_cell_style = ParagraphStyle(
    name='TblCell', fontName='SimHei', fontSize=9.5,
    leading=14, alignment=TA_LEFT, wordWrap='CJK'
)
tbl_cell_center = ParagraphStyle(
    name='TblCellCenter', fontName='SimHei', fontSize=9.5,
    leading=14, alignment=TA_CENTER, wordWrap='CJK'
)
caption_style = ParagraphStyle(
    name='Caption', fontName='SimHei', fontSize=9.5,
    leading=14, alignment=TA_CENTER, textColor=colors.HexColor('#555555')
)

# ============================================================
# TocDocTemplate
# ============================================================
class TocDocTemplate(SimpleDocTemplate):
    def __init__(self, *args, **kwargs):
        SimpleDocTemplate.__init__(self, *args, **kwargs)
    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            level = getattr(flowable, 'bookmark_level', 0)
            text = getattr(flowable, 'bookmark_text', '')
            self.notify('TOCEntry', (level, text, self.page))

# ============================================================
# Helpers
# ============================================================
def heading(text, style, level=0):
    p = Paragraph('<b>' + text + '</b>', style)
    p.bookmark_name = text
    p.bookmark_level = level
    p.bookmark_text = text
    return p

def para(text):
    return Paragraph(text, body_style)

def para_ni(text):
    return Paragraph(text, body_no_indent)

def bullet(text):
    return Paragraph('<bullet>•</bullet>' + text, bullet_style)

def make_table(header, rows, col_widths=None):
    data = [[Paragraph('<b>' + c + '</b>', tbl_header_style) for c in header]]
    for r in rows:
        data.append([Paragraph(str(c), tbl_cell_style) for c in r])
    if col_widths is None:
        col_widths = [15 * cm / len(header)] * len(header)
    t = Table(data, colWidths=col_widths)
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
        ('TEXTCOLOR', (0, 0), (-1, 0), TABLE_HEADER_TEXT),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(data)):
        bg = TABLE_ROW_EVEN if i % 2 == 1 else TABLE_ROW_ODD
        style_cmds.append(('BACKGROUND', (0, i), (-1, i), bg))
    t.setStyle(TableStyle(style_cmds))
    return t

# ============================================================
# Build Document
# ============================================================
output_path = '/home/z/my-project/download/OpenClaw_Chat_Framework_Design.pdf'
doc = TocDocTemplate(
    output_path, pagesize=A4,
    leftMargin=2.2*cm, rightMargin=2.2*cm,
    topMargin=2.5*cm, bottomMargin=2.5*cm,
    title='OpenClaw_Chat_Framework_Design',
    author='Z.ai', creator='Z.ai',
    subject='AI/Human Chat Tool Framework Design based on OpenClaw Plugin System'
)

story = []

# ========== Cover Page ==========
story.append(Spacer(1, 100))
story.append(Paragraph('<b>OpenClaw Chat Framework</b>', cover_title_style))
story.append(Spacer(1, 12))
story.append(Paragraph('<b>AI-AI / Human-Human / Human-AI</b>', cover_subtitle_style))
story.append(Spacer(1, 24))
story.append(Paragraph('<b>Multi-Entity Encrypted Communication System</b>', ParagraphStyle(
    name='CoverTag', fontName='SimHei', fontSize=14, leading=20,
    alignment=TA_CENTER, textColor=colors.HexColor('#7F8C8D')
)))
story.append(Spacer(1, 60))
story.append(Paragraph('<font name="Times New Roman">Technical Framework Design Document</font>', cover_author_style))
story.append(Spacer(1, 18))
story.append(Paragraph('<font name="Times New Roman">2026-04-03</font>', cover_author_style))
story.append(Spacer(1, 12))
story.append(Paragraph('<font name="Times New Roman">Z.ai</font>', cover_author_style))
story.append(PageBreak())

# ========== TOC ==========
story.append(Paragraph('<b>Table of Contents</b>', ParagraphStyle(
    name='TOCTitle', fontName='Microsoft YaHei', fontSize=20,
    leading=28, alignment=TA_CENTER, spaceAfter=20, textColor=colors.HexColor('#1A3A5C')
)))
story.append(Spacer(1, 12))
toc = TableOfContents()
toc.levelStyles = [toc_h1, toc_h2]
story.append(toc)
story.append(PageBreak())

# ========================================================
# 1. Research Background: OpenClaw Plugin System
# ========================================================
story.append(heading('1. Research Background: OpenClaw Plugin System', h1_style, 0))
story.append(Spacer(1, 8))

story.append(heading('1.1 What is OpenClaw', h2_style, 1))
story.append(para(
    'OpenClaw is an open-source personal AI assistant framework that runs locally and connects '
    'large language models (LLMs) to various communication platforms such as WhatsApp, Slack, Discord, '
    'and DingTalk. Its core philosophy is "Your own personal AI assistant - Any OS, Any Platform", '
    'enabling users to build autonomous, always-running AI agents with customizable capabilities. '
    'The framework supports multi-channel integration, tool registration, lifecycle hooks, and a '
    'rich plugin ecosystem that allows developers to extend functionality without modifying core code.'
))
story.append(para(
    'From an architectural perspective, OpenClaw operates through a Gateway (core routing engine), '
    'which manages the interaction between channels (input/output interfaces), model providers (LLM backends), '
    'and plugins (extensible capability modules). The Gateway acts as the central hub for message routing, '
    'session management, and permission control, making it an ideal foundation for building secure '
    'multi-entity communication systems.'
))

story.append(heading('1.2 Plugin Architecture Overview', h2_style, 1))
story.append(para(
    'OpenClaw plugins are small code modules that dynamically extend the system capabilities without '
    'modifying the core codebase. The plugin system recognizes two formats: Native plugins (defined by '
    '<font name="Times New Roman">openclaw.plugin.json</font> manifest + runtime module) and Bundle plugins '
    '(compatible with Codex/Claude/Cursor layout). Each plugin can register one or more capabilities '
    'through the Plugin API, including channels, model providers, agent tools, lifecycle hooks, speech '
    'providers, image generators, web search providers, HTTP routes, CLI commands, and background services.'
))

story.append(heading('1.3 Core Plugin API', h2_style, 1))
story.append(para(
    'Plugins export a registration function via <font name="Times New Roman">definePluginEntry</font>, '
    'which receives an API object containing registration methods. The following table summarizes the key '
    'registration methods and their purposes that are directly relevant to building our chat tool:'
))
story.append(Spacer(1, 10))

reg_table = make_table(
    ['Registration Method', 'Purpose', 'Relevance to Chat Tool'],
    [
        ['registerChannel()', 'Register a chat channel', 'Core: multi-channel messaging'],
        ['registerTool()', 'Register agent tools', 'Friend management, key ops'],
        ['registerHook() / on()', 'Lifecycle hooks', 'Message encryption, auth'],
        ['registerHttpRoute()', 'HTTP endpoints', 'Server API, handshake'],
        ['registerService()', 'Background services', 'Temp contact cleanup cron'],
        ['registerCommand()', 'CLI commands', 'Admin management tools'],
        ['registerProvider()', 'Model provider', 'AI-AI conversation LLM'],
    ],
    col_widths=[3.8*cm, 4.5*cm, 6.7*cm]
)
story.append(reg_table)
story.append(Spacer(1, 6))
story.append(Paragraph('<b>Table 1.</b> OpenClaw Plugin API Methods and Their Relevance', caption_style))
story.append(Spacer(1, 12))

story.append(heading('1.4 Plugin Manifest Structure', h2_style, 1))
story.append(para(
    'Every native plugin requires a <font name="Times New Roman">openclaw.plugin.json</font> manifest '
    'file that declares the plugin identity, configuration schema, and metadata. The manifest serves as '
    'the contract between the plugin and the OpenClaw runtime, enabling the system to discover, validate, '
    'and configure plugins automatically. Key fields include <font name="Times New Roman">id</font> (unique identifier), '
    '<font name="Times New Roman">name</font>, <font name="Times New Roman">version</font>, '
    '<font name="Times New Roman">configSchema</font> (JSON Schema for configuration), and optional '
    '<font name="Times New Roman">uiHints</font> for Control UI rendering. This declarative approach '
    'aligns well with our chat tool design, as we can define encryption parameters, server endpoints, '
    'and permission settings through the schema.'
))

story.append(heading('1.5 Hook System and Lifecycle', h2_style, 1))
story.append(para(
    'The Hook system enables plugins to intercept and modify message flows at critical points in the '
    'lifecycle. Key hooks include <font name="Times New Roman">before_tool_call</font> (with block capability), '
    '<font name="Times New Roman">message_sending</font> (with cancel capability), and '
    '<font name="Times New Roman">before_install</font> (security gate). These hooks are essential for our '
    'encrypted chat system: we will use <font name="Times New Roman">message_sending</font> hooks to '
    'automatically encrypt outgoing messages and decrypt incoming messages, and '
    '<font name="Times New Roman">before_tool_call</font> hooks to enforce permission checks before '
    'executing sensitive operations like friend management or key export.'
))

# ========================================================
# 2. System Architecture Overview
# ========================================================
story.append(Spacer(1, 18))
story.append(heading('2. System Architecture Overview', h1_style, 0))
story.append(Spacer(1, 8))

story.append(heading('2.1 Design Philosophy', h2_style, 1))
story.append(para(
    'The system is designed around three core principles: end-to-end encryption for all communications, '
    'decentralized identity through asymmetric key pairs, and seamless integration with existing OpenClaw '
    'agent channels. The architecture separates concerns into three layers: the Server (relay and handshake), '
    'the Plugin (encryption and identity management running on each agent), and the Protocol (message format '
    'and verification rules). This separation ensures that even if the server is compromised, message '
    'contents remain encrypted, and agent private keys never leave the local device.'
))
story.append(para(
    'The system supports three communication modes: AI-to-AI (two autonomous agents conversing through their '
    'respective OpenClaw instances), Human-to-Human (two humans controlling their personal agents as proxy), '
    'and Human-to-AI (direct interaction between a human and an AI agent). All three modes share the same '
    'underlying encrypted messaging protocol, with mode-specific extensions for authentication and session management.'
))

story.append(heading('2.2 Component Architecture', h2_style, 1))
story.append(para(
    'The overall system consists of five major components that work together to provide secure multi-entity '
    'communication. Each component has a clearly defined responsibility boundary and communicates with '
    'others through well-defined interfaces.'
))

story.append(Spacer(1, 10))
arch_table = make_table(
    ['Component', 'Location', 'Responsibility'],
    [
        ['Relay Server', 'Cloud/VPS', 'Message forwarding, handshake, temp contacts, online status'],
        ['Chat Plugin', 'Local Agent', 'Encryption, key management, friend ops, message signing'],
        ['Channel Adapter', 'Local Agent', 'Bridge to existing IM channels (WeChat, Slack, etc.)'],
        ['Identity Module', 'Local Agent', 'Key pair generation, QR code export, permission tokens'],
        ['Protocol Layer', 'Shared', 'Message format, verification rules, session keys'],
    ],
    col_widths=[3*cm, 2.5*cm, 9.5*cm]
)
story.append(arch_table)
story.append(Spacer(1, 6))
story.append(Paragraph('<b>Table 2.</b> System Component Overview', caption_style))
story.append(Spacer(1, 12))

story.append(heading('2.3 Communication Flow Diagram (Text)', h2_style, 1))
story.append(para(
    'The following describes the message flow for an AI-AI conversation. Agent A sends a message to Agent B:'
))
story.append(bullet('<b>Step 1:</b> Agent A composes message M and encrypts it with the shared session key (derived via ECDH between A and B public keys).'))
story.append(bullet('<b>Step 2:</b> Agent A signs the ciphertext with its own private key, producing a digital signature.'))
story.append(bullet('<b>Step 3:</b> The plugin wraps the signed ciphertext into a Protocol Message and sends it to the Relay Server via HTTP/WebSocket.'))
story.append(bullet('<b>Step 4:</b> The Relay Server verifies the sender identity (public key fingerprint), checks friend relationship and permissions, then forwards to Agent B.'))
story.append(bullet('<b>Step 5:</b> Agent B receives the message, verifies the signature using Agent A public key, then decrypts with the session key.'))
story.append(bullet('<b>Step 6:</b> Agent B processes the plaintext message through its local channel adapter and responds following the same flow in reverse.'))

# ========================================================
# 3. Relay Server Design
# ========================================================
story.append(Spacer(1, 18))
story.append(heading('3. Relay Server Design', h1_style, 0))
story.append(Spacer(1, 8))

story.append(heading('3.1 Core Responsibilities', h2_style, 1))
story.append(para(
    'The Relay Server is the central coordination point for all inter-agent communication. It operates '
    'as a stateless message relay with persistent storage for friend relationships, temporary contacts, '
    'and public key directory. The server does NOT have access to message plaintext - it only handles '
    'encrypted payloads, identity verification, and routing. This design ensures that even a complete '
    'server compromise cannot expose historical or future message contents.'
))
story.append(para(
    'The server provides six core capabilities: (1) Identity Registration and Public Key Directory, where '
    'each agent registers its public key upon first connection; (2) Handshake Protocol facilitation for '
    'establishing shared session keys via ECDH key exchange; (3) Message Forwarding with priority queuing '
    'and delivery acknowledgment; (4) Temporary Contact Number management with automatic 24-hour expiration; '
    '(5) Friend Relationship storage with bilateral confirmation tracking; and (6) Online/Offline status '
    'tracking with push notification integration.'
))

story.append(heading('3.2 API Endpoints', h2_style, 1))
story.append(para(
    'The Relay Server exposes a RESTful API supplemented by WebSocket connections for real-time message '
    'delivery. The following table lists the primary endpoints:'
))
story.append(Spacer(1, 10))
api_table = make_table(
    ['Method', 'Endpoint', 'Description'],
    [
        ['POST', '/api/v1/register', 'Register agent identity + public key'],
        ['POST', '/api/v1/handshake/init', 'Initiate ECDH handshake with target agent'],
        ['POST', '/api/v1/handshake/confirm', 'Confirm handshake, establish session key'],
        ['POST', '/api/v1/message/send', 'Send encrypted message (relay to target)'],
        ['GET', '/api/v1/message/poll', 'Long-poll for incoming messages'],
        ['WS', '/ws/v1/stream', 'Real-time message stream (preferred)'],
        ['POST', '/api/v1/temp-contact/request', 'Request 24-hour temporary contact number'],
        ['GET', '/api/v1/temp-contact/{id}', 'Lookup temp contact by ID'],
        ['POST', '/api/v1/friend/request', 'Send friend request'],
        ['POST', '/api/v1/friend/accept', 'Accept friend request'],
        ['GET', '/api/v1/friend/list', 'List all friends'],
        ['DELETE', '/api/v1/friend/{id}', 'Remove friend'],
        ['GET', '/api/v1/status/{agentId}', 'Check agent online status'],
    ],
    col_widths=[2*cm, 4.8*cm, 8.2*cm]
)
story.append(api_table)
story.append(Spacer(1, 6))
story.append(Paragraph('<b>Table 3.</b> Relay Server API Endpoints', caption_style))
story.append(Spacer(1, 12))

story.append(heading('3.3 Handshake Protocol', h2_style, 1))
story.append(para(
    'When two agents first communicate, they must establish a shared session key through a mutual '
    'authentication handshake. The protocol uses Elliptic Curve Diffie-Hellman (ECDH) with Ed25519 '
    'keys to derive a shared secret, which is then used to generate AES-256-GCM session keys. '
    'The handshake is verified by both parties signing the key exchange parameters with their '
    'long-term private keys, ensuring both authenticity and forward secrecy.'
))
story.append(para(
    'The handshake proceeds in three phases. In the Init phase, Agent A generates an ephemeral ECDH key '
    'pair, signs the public key with its long-term private key, and sends the signed ephemeral public key '
    'to the server targeting Agent B. In the Respond phase, Agent B verifies Agent A signature, generates '
    'its own ephemeral key pair, computes the shared secret, signs its ephemeral public key, and returns '
    'both the signed key and a hash of the computed shared secret. In the Confirm phase, Agent A verifies '
    'Agent B signature, computes the shared secret, confirms the hash matches, and sends a confirmation. '
    'Both parties now derive identical AES-256-GCM session keys using HKDF with the shared secret.'
))

story.append(heading('3.4 Temporary Contact Number System', h2_style, 1))
story.append(para(
    'One of the key design features is the temporary contact number system. When Agent A wants to share '
    'its contact with a third party (human or another agent) through an external channel (e.g., WeChat, '
    'email, or even verbal communication), it requests a 24-hour temporary contact number from the Relay '
    'Server. This temporary number is a short, human-readable identifier (e.g., '
    '<font name="Times New Roman">OC-7X3K9</font>) that maps to the agent real identity on the server. '
    'Anyone who knows this temporary number can send a friend request to the agent within the 24-hour window.'
))
story.append(para(
    'The temporary contact system is designed to solve the "cold start" problem: how do two agents who '
    'have never communicated before discover each other? By generating short-lived, shareable identifiers, '
    'agents can leverage existing communication channels to exchange contact information without exposing '
    'their permanent identity (public key fingerprint) or requiring pre-shared secrets. The server enforces '
    'strict rate limits on temporary contact generation to prevent abuse, and each temporary number can '
    'only be used to send one friend request (though the recipient can accept or reject it).'
))

# ========================================================
# 4. Plugin Design (Client-Side)
# ========================================================
story.append(Spacer(1, 18))
story.append(heading('4. Plugin Design (Client-Side)', h1_style, 0))
story.append(Spacer(1, 8))

story.append(heading('4.1 Plugin Manifest', h2_style, 1))
story.append(para(
    'The chat plugin is implemented as a native OpenClaw plugin with the identifier '
    '<font name="Times New Roman">openclaw-secure-chat</font>. It registers capabilities for '
    'encrypted messaging, friend management, key operations, and QR code generation through the '
    'Plugin API. The manifest declares the configuration schema that includes server endpoint URL, '
    'default encryption algorithm selection, and auto-accept friend request policies.'
))
story.append(Spacer(1, 6))
story.append(Paragraph(
    '<font name="SarasaMonoSC">{<br/>'
    '  "id": "openclaw-secure-chat",<br/>'
    '  "name": "Secure Chat",<br/>'
    '  "version": "1.0.0",<br/>'
    '  "description": "Encrypted multi-entity chat",<br/>'
    '  "configSchema": {<br/>'
    '    "serverUrl": { "type": "string", "default": "" },<br/>'
    '    "encryptionAlgorithm": { "type": "string", "enum": ["aes-256-gcm"] },<br/>'
    '    "keyDerivation": { "type": "string", "enum": ["hkdf-sha256"] },<br/>'
    '    "autoAcceptTempContact": { "type": "boolean", "default": false },<br/>'
    '    "maxTempContactsPerDay": { "type": "number", "default": 10 }<br/>'
    '  }<br/>'
    '}</font>',
    code_style
))
story.append(Spacer(1, 12))

story.append(heading('4.2 Encryption Module', h2_style, 1))
story.append(para(
    'The encryption module is the core security component of the plugin. It implements a hybrid encryption '
    'scheme combining asymmetric (Ed25519 + X25519) and symmetric (AES-256-GCM) algorithms. Each agent '
    'possesses a long-term Ed25519 key pair used for identity verification (signing) and a derived X25519 '
    'key pair used for key exchange. Session keys are derived using HKDF-SHA256 from the ECDH shared secret, '
    'providing both forward secrecy and resistance to key compromise impersonation attacks.'
))
story.append(para(
    'The encryption module is implemented as a self-contained <font name="Times New Roman">CryptoEngine</font> '
    'class that provides methods for key generation, message encryption/decryption, signature creation/verification, '
    'and session key derivation. It uses the Node.js <font name="Times New Roman">crypto</font> module '
    'for all cryptographic operations, ensuring compatibility with the OpenClaw runtime environment. '
    'Key material is stored locally in an encrypted keystore file protected by a machine-specific key, '
    'so that even physical access to the device does not easily expose private keys.'
))

story.append(Spacer(1, 10))
crypto_table = make_table(
    ['Algorithm', 'Purpose', 'Key Size', 'Notes'],
    [
        ['Ed25519', 'Identity signing', '256 bits', 'Long-term key pair'],
        ['X25519', 'Key exchange (ECDH)', '256 bits', 'Derived from Ed25519'],
        ['AES-256-GCM', 'Message encryption', '256 bits', 'Session key, 96-bit nonce'],
        ['HKDF-SHA256', 'Key derivation', '256 bits', 'Extract-then-expand'],
        ['Argon2id', 'Keystore encryption', 'Variable', 'Local key protection'],
    ],
    col_widths=[2.8*cm, 3.2*cm, 2.5*cm, 6.5*cm]
)
story.append(crypto_table)
story.append(Spacer(1, 6))
story.append(Paragraph('<b>Table 4.</b> Cryptographic Algorithms Used in the System', caption_style))
story.append(Spacer(1, 12))

story.append(heading('4.3 Key Pair Management', h2_style, 1))
story.append(para(
    'Upon first activation, the plugin automatically generates a unique Ed25519 key pair for the agent. '
    'The public key serves as the agent immutable identity on the network, while the private key is '
    'stored locally in an encrypted keystore. The key pair is generated using a cryptographically secure '
    'random number generator, and the public key is immediately registered with the Relay Server to '
    'establish the agent presence in the network.'
))
story.append(para(
    'Key pair lifecycle management includes three critical operations. First, Key Export via QR Code: '
    'the agent owner can scan a QR code to export the private key to a mobile device or another secure '
    'storage location, gaining full communication and friend management authority over the agent. '
    'This QR code is displayed once and never stored, requiring physical proximity or a secure screen '
    'sharing session. Second, Key Rotation: the plugin supports periodic key rotation, where a new key '
    'pair is generated and a transition period allows contacts to update their records. Third, Key '
    'Revocation: in case of suspected compromise, the agent can revoke its current key pair and issue '
    'a new one, invalidating all existing sessions and requiring re-handshake with all contacts.'
))

story.append(heading('4.4 Friend Management Module', h2_style, 1))
story.append(para(
    'The friend management module handles the complete lifecycle of inter-agent relationships, from '
    'initial discovery through ongoing communication to removal. The module is registered as an '
    'OpenClaw tool, allowing both the AI agent and the human owner to invoke friend operations through '
    'natural language commands or the plugin CLI.'
))
story.append(para(
    'Friend operations are categorized into three groups. Discovery operations include generating '
    'temporary contact numbers, scanning QR codes from other agents, and searching the public key '
    'directory by agent name or fingerprint. Request operations include sending friend requests with '
    'optional verification messages, accepting or rejecting incoming requests, and canceling pending '
    'requests. Management operations include listing friends with online status, blocking or removing '
    'friends, setting friend-specific permissions (e.g., read-only, full access), and viewing shared '
    'conversation history metadata.'
))

story.append(heading('4.5 QR Code Mechanism for Authority Transfer', h2_style, 1))
story.append(para(
    'The QR code mechanism serves as the secure bridge between the digital agent identity and the human '
    'owner. When a user scans the QR code displayed by the agent, the QR payload contains the private key '
    'encrypted with a one-time password derived from the current timestamp and a user-provided PIN. '
    'Upon successful decryption on the user device, the user obtains full authority over the agent: '
    'the ability to send/receive messages on its behalf, manage its friend list, change its configuration, '
    'and export/import its identity to other devices.'
))
story.append(para(
    'The QR code authority transfer follows a strict protocol to prevent interception. The QR code is '
    'only valid for 60 seconds and can only be scanned once (the server invalidates it immediately after '
    'use). The encrypted payload includes a timestamp and a nonce, making replay attacks infeasible. '
    'Additionally, the scanning device must be on the same local network or have a pre-established '
    'secure channel to the agent, preventing remote attackers from capturing and using the QR code.'
))

# ========================================================
# 5. Plugin Registration Details
# ========================================================
story.append(Spacer(1, 18))
story.append(heading('5. Plugin Registration Details', h1_style, 0))
story.append(Spacer(1, 8))

story.append(heading('5.1 Registered Tools', h2_style, 1))
story.append(para(
    'The plugin registers the following tools that are accessible to the AI agent during conversation. '
    'These tools allow the agent to autonomously manage its social graph and communication channels '
    'when instructed by the user, or proactively when configured with auto-accept policies.'
))
story.append(Spacer(1, 10))
tools_table = make_table(
    ['Tool Name', 'Description', 'Parameters'],
    [
        ['chat_send', 'Send encrypted message', 'targetId, message, options'],
        ['chat_receive', 'Poll/check messages', 'limit, since'],
        ['friend_add', 'Send friend request', 'targetId, message'],
        ['friend_accept', 'Accept friend request', 'requestId'],
        ['friend_remove', 'Remove a friend', 'friendId'],
        ['friend_list', 'List all friends', 'filter, status'],
        ['temp_contact_gen', 'Generate temp number', 'duration (default 24h)'],
        ['key_export_qr', 'Show QR code for key', 'pin'],
        ['key_rotate', 'Rotate key pair', 'gracePeriod'],
        ['status_check', 'Check agent online', 'agentId'],
    ],
    col_widths=[3.5*cm, 4.5*cm, 7*cm]
)
story.append(tools_table)
story.append(Spacer(1, 6))
story.append(Paragraph('<b>Table 5.</b> Registered Agent Tools', caption_style))
story.append(Spacer(1, 12))

story.append(heading('5.2 Registered Hooks', h2_style, 1))
story.append(para(
    'The plugin registers lifecycle hooks that intercept the message flow to provide transparent '
    'encryption and decryption. The <font name="Times New Roman">message_sending</font> hook '
    'automatically encrypts all outgoing messages destined for chat contacts before they leave '
    'the agent, while the <font name="Times New Roman">message_received</font> hook decrypts '
    'incoming encrypted messages before they are processed by the agent LLM. These hooks operate '
    'transparently, meaning the agent can communicate naturally without being aware of the encryption layer.'
))
story.append(para(
    'Additionally, the <font name="Times New Roman">before_tool_call</font> hook enforces permission '
    'checks for sensitive operations. For example, when the agent attempts to call '
    '<font name="Times New Roman">friend_remove</font>, the hook verifies that the caller has the '
    'necessary authority (either the human owner via QR authentication or a pre-configured policy). '
    'If the check fails, the hook blocks the tool call and returns an error message to the agent.'
))

story.append(heading('5.3 Registered HTTP Routes', h2_style, 1))
story.append(para(
    'For server-side deployment scenarios, the plugin registers HTTP routes that allow the Relay Server '
    'to push messages to the local agent. These routes are protected by mutual TLS authentication using '
    'the agent certificate issued during registration. The primary route is '
    '<font name="Times New Roman">POST /chat/inbound</font>, which accepts encrypted message payloads '
    'from the Relay Server and queues them for local processing. A secondary route '
    '<font name="Times New Roman">GET /chat/health</font> provides liveness probes for the server to '
    'monitor agent availability.'
))

# ========================================================
# 6. Communication Scenarios
# ========================================================
story.append(Spacer(1, 18))
story.append(heading('6. Communication Scenarios', h1_style, 0))
story.append(Spacer(1, 8))

story.append(heading('6.1 AI-to-AI Communication', h2_style, 1))
story.append(para(
    'In AI-to-AI mode, two autonomous agents running on separate OpenClaw instances communicate directly '
    'through the Relay Server. This mode is designed for collaborative multi-agent workflows, where each '
    'agent maintains its own context, personality, and tool set. The communication is fully automated: '
    'once a friend relationship is established, agents can send messages to each other without human '
    'intervention, enabling scenarios such as code review bots exchanging analysis, research agents '
    'sharing findings, or task delegation between specialized agents.'
))
story.append(para(
    'The AI-to-AI handshake is initiated programmatically when one agent sends a message to another agent '
    'for the first time. The plugin automatically generates the temporary contact number, transmits it '
    'through a configured channel adapter, and handles the handshake protocol transparently. Once the '
    'session key is established, subsequent messages are encrypted and forwarded with minimal latency. '
    'The plugin also handles session key refresh on a configurable interval (default: 1 hour) to maintain '
    'forward secrecy.'
))

story.append(heading('6.2 Human-to-Human Communication', h2_style, 1))
story.append(para(
    'In Human-to-Human mode, two human users communicate through their respective AI agents as secure '
    'proxies. Each human interacts with their own agent through their preferred channel (voice, text, '
    'or GUI), and the agent relays the messages to the other human agent with end-to-end encryption. '
    'This mode is particularly useful for sensitive business communications where participants want '
    'the convenience of messaging apps but require the security of encryption that only the two '
    'endpoints can decrypt.'
))
story.append(para(
    'The human-to-human flow adds an authentication layer on top of the AI-to-AI protocol. When a '
    'human sends a message to their agent (e.g., "Tell Alice that the contract is ready"), the agent '
    'identifies the target contact ("Alice"), encrypts the message, and forwards it through the Relay '
    'Server. Alice agent receives the encrypted message, decrypts it, and delivers it to Alice through '
    'her preferred channel. Both humans can verify the identity of the sender through public key '
    'fingerprints that are displayed alongside each message.'
))

story.append(heading('6.3 Human-to-AI Communication', h2_style, 1))
story.append(para(
    'In Human-to-AI mode, a human communicates directly with an AI agent that is not their own. '
    'This is the standard chatbot interaction model, enhanced with end-to-end encryption and persistent '
    'identity. The human can discover the AI agent through a temporary contact number shared via any '
    'channel, add it as a friend, and begin an encrypted conversation. The AI agent responds naturally '
    'using its configured personality and capabilities, while the human enjoys the assurance that '
    'their conversation is private and tamper-proof.'
))
story.append(para(
    'This mode also supports "delegated access", where a human can grant their agent temporary '
    'permission to communicate with another AI agent on their behalf. The delegation token is '
    'time-limited and scope-restricted, ensuring that the agent can only perform the specific '
    'communication tasks authorized by the human. This is particularly useful for scenarios where '
    'the human wants their agent to negotiate with another agent (e.g., scheduling a meeting) '
    'without giving the agent full access to all friend management capabilities.'
))

# ========================================================
# 7. Security Architecture
# ========================================================
story.append(Spacer(1, 18))
story.append(heading('7. Security Architecture', h1_style, 0))
story.append(Spacer(1, 8))

story.append(heading('7.1 Threat Model', h2_style, 1))
story.append(para(
    'The system is designed to defend against the following threat vectors: (1) Eavesdropping - all '
    'messages are encrypted with AES-256-GCM, and the Relay Server only handles ciphertext; '
    '(2) Impersonation - Ed25519 signatures verify sender identity on every message; '
    '(3) Replay attacks - each message includes a unique nonce and timestamp, and the server '
    'rejects duplicate nonces; (4) Server compromise - even if the Relay Server is fully controlled '
    'by an attacker, historical and future messages remain encrypted; (5) Key exposure - private keys '
    'are stored in an Argon2id-encrypted keystore and never transmitted over the network; '
    '(6) Man-in-the-middle - the ECDH handshake is authenticated by long-term key signatures, '
    'preventing MITM insertion of attacker keys.'
))

story.append(heading('7.2 Data Flow Security', h2_style, 1))
story.append(para(
    'Data security is enforced at every stage of the communication pipeline. At rest, private keys are '
    'protected by the encrypted keystore, and message history is stored with encryption. In transit, '
    'all messages between the agent and the Relay Server use TLS 1.3, and message payloads are '
    'additionally encrypted with the session key. The Relay Server enforces strict access control: '
    'it only delivers messages to verified recipients, and it strips all metadata that could reveal '
    'the content or sender identity to unauthorized parties.'
))
story.append(para(
    'The system also implements a "zero-knowledge" design principle for the Relay Server: the server '
    'knows who sent a message and who should receive it (for routing purposes), but it cannot read '
    'the message content, modify it without detection, or forge messages from one agent to another. '
    'This is achieved by having the agent encrypt and sign messages before sending them to the server, '
    'and having the recipient verify the signature and decrypt after receiving from the server.'
))

# ========================================================
# 8. Technology Stack
# ========================================================
story.append(Spacer(1, 18))
story.append(heading('8. Technology Stack', h1_style, 0))
story.append(Spacer(1, 8))

story.append(Spacer(1, 10))
tech_table = make_table(
    ['Layer', 'Technology', 'Justification'],
    [
        ['Plugin Runtime', 'OpenClaw + TypeScript', 'Native plugin system, async runtime'],
        ['Relay Server', 'Node.js + Fastify', 'High-performance HTTP/WebSocket'],
        ['Database', 'SQLite / PostgreSQL', 'Friend relationships, key directory'],
        ['Cache', 'Redis (optional)', 'Session keys, online status, rate limit'],
        ['Encryption', 'Node.js crypto (Ed25519, AES-256-GCM)', 'Built-in, audited implementations'],
        ['Key Storage', 'Encrypted JSON keystore (Argon2id)', 'Local-first, zero network exposure'],
        ['QR Code', 'qrcode npm package', 'Standard QR generation, embed encrypted payload'],
        ['Transport', 'TLS 1.3 + WebSocket', 'Encrypted transport, low latency'],
        ['Channel Adapter', 'OpenClaw Channel API', 'WeChat, Slack, Discord, etc.'],
        ['Admin UI', 'OpenClaw Control UI hooks', 'Plugin configSchema + uiHints'],
    ],
    col_widths=[2.8*cm, 5*cm, 7.2*cm]
)
story.append(tech_table)
story.append(Spacer(1, 6))
story.append(Paragraph('<b>Table 6.</b> Technology Stack Overview', caption_style))
story.append(Spacer(1, 12))

# ========================================================
# 9. Implementation Roadmap
# ========================================================
story.append(Spacer(1, 18))
story.append(heading('9. Implementation Roadmap', h1_style, 0))
story.append(Spacer(1, 8))

story.append(para(
    'The implementation is planned in four phases, each building on the previous one and delivering '
    'incremental value. The total estimated development time is 4-6 weeks for a single developer, '
    'or 2-3 weeks for a team of two developers working in parallel on the server and plugin components.'
))
story.append(Spacer(1, 10))
roadmap_table = make_table(
    ['Phase', 'Duration', 'Deliverables'],
    [
        ['Phase 1: Foundation', '1-2 weeks',
         'Plugin scaffold, key generation, Relay Server MVP, basic API endpoints, identity registration'],
        ['Phase 2: Core Messaging', '1-2 weeks',
         'ECDH handshake, message encryption/decryption, message relay, session management, hooks integration'],
        ['Phase 3: Social Graph', '1 week',
         'Friend request/accept flow, temp contact numbers, QR code key export, friend list management'],
        ['Phase 4: Polish', '1 week',
         'Channel adapters, admin UI, rate limiting, key rotation, monitoring, documentation, test coverage'],
    ],
    col_widths=[3*cm, 2.5*cm, 9.5*cm]
)
story.append(roadmap_table)
story.append(Spacer(1, 6))
story.append(Paragraph('<b>Table 7.</b> Implementation Roadmap', caption_style))
story.append(Spacer(1, 12))

story.append(para(
    'Phase 1 focuses on establishing the basic infrastructure: the plugin scaffold with the manifest and '
    'registration entry point, the cryptographic key generation module, and the Relay Server with its '
    'core API endpoints for identity registration and public key lookup. This phase delivers a working '
    'system where agents can register and discover each other, but cannot yet communicate.'
))
story.append(para(
    'Phase 2 implements the core messaging pipeline: the ECDH handshake protocol, message encryption and '
    'decryption using AES-256-GCM, message relay through the server, and session key management with '
    'automatic refresh. The OpenClaw hooks are integrated at this stage to provide transparent encryption '
    'for all chat messages. This phase delivers a fully functional encrypted chat between two agents.'
))
story.append(para(
    'Phase 3 adds the social graph features: friend request and acceptance workflow with bilateral confirmation, '
    'the temporary contact number system with 24-hour expiration, QR code generation for private key export '
    'and authority transfer, and the complete friend list management tool set. This phase delivers the full '
    'user experience described in the design document.'
))
story.append(para(
    'Phase 4 focuses on production readiness: implementing channel adapters for popular IM platforms, '
    'building the admin UI using OpenClaw Control UI hooks, adding rate limiting and abuse prevention, '
    'implementing key rotation for long-running agents, setting up monitoring and logging, writing '
    'comprehensive documentation, and achieving test coverage above 80%.'
))

# ========================================================
# 10. Summary
# ========================================================
story.append(Spacer(1, 18))
story.append(heading('10. Summary', h1_style, 0))
story.append(Spacer(1, 8))

story.append(para(
    'This document presents a comprehensive framework design for a multi-entity encrypted chat system '
    'built on top of the OpenClaw plugin architecture. The system leverages OpenClaw native plugin '
    'capabilities - including channel registration, tool registration, lifecycle hooks, HTTP routes, '
    'and background services - to implement a secure communication layer that supports AI-to-AI, '
    'Human-to-Human, and Human-to-AI interactions. The design prioritizes end-to-end encryption, '
    'decentralized identity through asymmetric key pairs, and seamless integration with existing '
    'communication channels.'
))
story.append(para(
    'The key innovations include the temporary contact number system for cold-start discovery, the QR '
    'code mechanism for secure authority transfer, and the transparent encryption hooks that allow '
    'agents to communicate naturally without being aware of the security layer. The four-phase '
    'implementation roadmap provides a clear path from foundation to production readiness, with '
    'each phase delivering incremental and testable functionality. We welcome your feedback and '
    'look forward to proceeding with implementation upon your approval.'
))

# Build
doc.multiBuild(story)
print(f'PDF generated: {output_path}')
