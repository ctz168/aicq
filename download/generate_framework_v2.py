# -*- coding: utf-8 -*-
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    Paragraph, Spacer, PageBreak, Table, TableStyle, SimpleDocTemplate
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

# ============================================================
# Fonts
# ============================================================
pdfmetrics.registerFont(TTFont('Microsoft YaHei', '/usr/share/fonts/truetype/chinese/msyh.ttf'))
pdfmetrics.registerFont(TTFont('SimHei', '/usr/share/fonts/truetype/chinese/SimHei.ttf'))
pdfmetrics.registerFont(TTFont('Times New Roman', '/usr/share/fonts/truetype/english/Times-New-Roman.ttf'))
pdfmetrics.registerFont(TTFont('SarasaMonoSC', '/usr/share/fonts/truetype/chinese/SarasaMonoSC-Regular.ttf'))
registerFontFamily('Microsoft YaHei', normal='Microsoft YaHei', bold='Microsoft YaHei')
registerFontFamily('SimHei', normal='SimHei', bold='SimHei')
registerFontFamily('Times New Roman', normal='Times New Roman', bold='Times New Roman')

# ============================================================
# Colors
# ============================================================
HDR_BG = colors.HexColor('#1F4E79')
HDR_TX = colors.white
ROW_ODD = colors.HexColor('#F5F5F5')
ACCENT = colors.HexColor('#2E86C1')

# ============================================================
# Styles
# ============================================================
cover_title = ParagraphStyle(name='CT', fontName='Microsoft YaHei', fontSize=34, leading=46, alignment=TA_CENTER, textColor=colors.HexColor('#1A3A5C'))
cover_sub = ParagraphStyle(name='CS', fontName='SimHei', fontSize=17, leading=24, alignment=TA_CENTER, textColor=colors.HexColor('#2E86C1'))
cover_info = ParagraphStyle(name='CI', fontName='SimHei', fontSize=13, leading=20, alignment=TA_CENTER, textColor=colors.HexColor('#666666'))

h1 = ParagraphStyle(name='H1', fontName='Microsoft YaHei', fontSize=19, leading=27, spaceBefore=16, spaceAfter=8, textColor=colors.HexColor('#1A3A5C'))
h2 = ParagraphStyle(name='H2', fontName='Microsoft YaHei', fontSize=14, leading=21, spaceBefore=12, spaceAfter=6, textColor=colors.HexColor('#2E86C1'))
h3 = ParagraphStyle(name='H3', fontName='SimHei', fontSize=11.5, leading=17, spaceBefore=8, spaceAfter=4, textColor=colors.HexColor('#34495E'))

body = ParagraphStyle(name='Body', fontName='SimHei', fontSize=10.5, leading=18, alignment=TA_LEFT, firstLineIndent=21, wordWrap='CJK', spaceAfter=4)
body_ni = ParagraphStyle(name='BodyNI', fontName='SimHei', fontSize=10.5, leading=18, alignment=TA_LEFT, wordWrap='CJK', spaceAfter=4)
bullet = ParagraphStyle(name='Bul', fontName='SimHei', fontSize=10.5, leading=18, alignment=TA_LEFT, leftIndent=24, bulletIndent=12, wordWrap='CJK', spaceAfter=3)
code = ParagraphStyle(name='Code', fontName='SarasaMonoSC', fontSize=9, leading=14, alignment=TA_LEFT, leftIndent=18, rightIndent=18, backColor=colors.HexColor('#F4F6F8'), borderPadding=5, spaceAfter=4, spaceBefore=4)
caption = ParagraphStyle(name='Cap', fontName='SimHei', fontSize=9.5, leading=14, alignment=TA_CENTER, textColor=colors.HexColor('#555555'))

th = ParagraphStyle(name='TH', fontName='SimHei', fontSize=10, leading=14, alignment=TA_CENTER, textColor=colors.white, wordWrap='CJK')
tc = ParagraphStyle(name='TC', fontName='SimHei', fontSize=9.5, leading=14, alignment=TA_LEFT, wordWrap='CJK')
tcc = ParagraphStyle(name='TCC', fontName='SimHei', fontSize=9.5, leading=14, alignment=TA_CENTER, wordWrap='CJK')

toc1 = ParagraphStyle(name='T1', fontName='SimHei', fontSize=13, leftIndent=20, leading=22)
toc2 = ParagraphStyle(name='T2', fontName='SimHei', fontSize=11, leftIndent=40, leading=18)

# ============================================================
# Helpers
# ============================================================
class TocDoc(SimpleDocTemplate):
    def afterFlowable(self, f):
        if hasattr(f, 'bm'):
            self.notify('TOCEntry', (getattr(f, 'bl', 0), getattr(f, 'bt', ''), self.page))

def hd(text, style, level=0):
    p = Paragraph('<b>' + text + '</b>', style)
    p.bm = text; p.bl = level; p.bt = text
    return p

def p(text): return Paragraph(text, body)
def pn(text): return Paragraph(text, body_ni)
def bl(text): return Paragraph('<bullet>&bull;</bullet>' + text, bullet)

def tbl(headers, rows, cw=None):
    data = [[Paragraph('<b>' + c + '</b>', th) for c in headers]]
    for r in rows:
        data.append([Paragraph(str(c), tc) for c in r])
    if not cw:
        cw = [15*cm / len(headers)] * len(headers)
    t = Table(data, colWidths=cw)
    sc = [
        ('BACKGROUND', (0,0), (-1,0), HDR_BG),
        ('TEXTCOLOR', (0,0), (-1,0), HDR_TX),
        ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('LEFTPADDING', (0,0), (-1,-1), 7),
        ('RIGHTPADDING', (0,0), (-1,-1), 7),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ]
    for i in range(1, len(data)):
        sc.append(('BACKGROUND', (0,i), (-1,i), colors.white if i%2==1 else ROW_ODD))
    t.setStyle(TableStyle(sc))
    return t

# ============================================================
# Build
# ============================================================
out = '/home/z/my-project/download/OpenClaw_Chat_Framework_v2.pdf'
doc = TocDoc(out, pagesize=A4, leftMargin=2.2*cm, rightMargin=2.2*cm, topMargin=2.5*cm, bottomMargin=2.5*cm,
    title='OpenClaw_Chat_Framework_v2', author='Z.ai', creator='Z.ai',
    subject='P2P Encrypted Chat System - Three-Part Architecture')

s = []

# ====================== COVER ======================
s.append(Spacer(1, 90))
s.append(Paragraph('<b>OpenClaw Secure Chat</b>', cover_title))
s.append(Spacer(1, 10))
s.append(Paragraph('<b>AI-AI / Human-Human / Human-AI</b>', cover_sub))
s.append(Spacer(1, 8))
s.append(Paragraph('<b>P2P Encrypted Communication System</b>', ParagraphStyle(name='Tag', fontName='SimHei', fontSize=14, leading=20, alignment=TA_CENTER, textColor=colors.HexColor('#7F8C8D'))))
s.append(Spacer(1, 50))
s.append(Paragraph('Three-Part Architecture Design Document', ParagraphStyle(name='T1', fontName='Times New Roman', fontSize=15, leading=22, alignment=TA_CENTER, textColor=colors.HexColor('#555555'))))
s.append(Spacer(1, 8))
s.append(Paragraph('Server + Plugin + Client', ParagraphStyle(name='T2', fontName='Times New Roman', fontSize=14, leading=20, alignment=TA_CENTER, textColor=colors.HexColor('#888888'))))
s.append(Spacer(1, 60))
s.append(Paragraph('<font name="Times New Roman">Version 2.0 | 2026-04-03</font>', cover_info))
s.append(Spacer(1, 10))
s.append(Paragraph('<font name="Times New Roman">Z.ai</font>', cover_info))
s.append(PageBreak())

# ====================== TOC ======================
s.append(Paragraph('<b>Table of Contents</b>', ParagraphStyle(name='TOCT', fontName='Microsoft YaHei', fontSize=19, leading=27, alignment=TA_CENTER, textColor=colors.HexColor('#1A3A5C'), spaceAfter=16)))
toc = TableOfContents()
toc.levelStyles = [toc1, toc2]
s.append(toc)
s.append(PageBreak())

# ========================================================
# 1. Research Background
# ========================================================
s.append(hd('1. Research Background: OpenClaw Plugin System', h1, 0))
s.append(Spacer(1, 6))

s.append(hd('1.1 What is OpenClaw', h2, 1))
s.append(p('OpenClaw is an open-source personal AI assistant framework running locally, connecting LLMs to '
    'communication platforms (WhatsApp, Slack, Discord, DingTalk, etc.). Its philosophy is "Your own personal '
    'AI assistant - Any OS, Any Platform". The core is a Gateway routing engine that manages channels (I/O), '
    'model providers (LLM backends), and plugins (extensible capabilities). Plugins register capabilities '
    'through the Plugin API: registerChannel(), registerTool(), registerHook(), registerHttpRoute(), '
    'registerService(), registerCommand(), registerProvider(). Each plugin has a openclaw.plugin.json manifest '
    'declaring identity, configSchema, and metadata.'))
s.append(p('Our chat system is built as a native OpenClaw plugin (openclaw-secure-chat), leveraging the Plugin API '
    'for transparent encryption hooks, friend management tools, and HTTP routes. The plugin is one of the three '
    'independent parts of the overall architecture, alongside the Relay Server and the Human Client.'))

s.append(hd('1.2 Key Plugin APIs Used', h2, 1))
s.append(Spacer(1, 8))
s.append(tbl(
    ['API Method', 'Purpose', 'Usage in Chat System'],
    [
        ['registerChannel()', 'Register chat channel', 'Secure chat channel adapter'],
        ['registerTool()', 'Register agent tools', 'Friend mgmt, key ops, messaging'],
        ['registerHook()', 'Lifecycle hooks', 'message_sending: auto-encrypt; before_tool_call: permission check'],
        ['registerHttpRoute()', 'HTTP endpoints', 'Inbound message push, health probes'],
        ['registerService()', 'Background services', 'Session key refresh, temp contact cleanup'],
    ],
    cw=[3.5*cm, 4*cm, 7.5*cm]
))
s.append(Spacer(1, 6))
s.append(Paragraph('<b>Table 1.</b> OpenClaw Plugin APIs Used in This System', caption))

# ========================================================
# 2. Architecture Overview
# ========================================================
s.append(Spacer(1, 16))
s.append(hd('2. Three-Part Architecture Overview', h1, 0))
s.append(Spacer(1, 6))

s.append(hd('2.1 Core Design Principles', h2, 1))
s.append(p('The system is decomposed into three fully independent codebases that communicate through well-defined '
    'protocols. This separation ensures that each part can be developed, deployed, and upgraded independently. '
    'The three parts are: (1) Relay Server - a cloud service handling discovery, signaling, and fallback relay; '
    '(2) OpenClaw Plugin - runs inside each AI agent instance, providing encryption, identity, and friend management; '
    '(3) Human Client - a TypeScript application that humans use to communicate, later portable to APK/iOS/WebView.'))
s.append(p('The core communication model is: handshake through the server, then P2P direct connection. After the '
    'ECDH key exchange completes via the server, both parties attempt to establish a direct P2P link. If P2P succeeds, '
    'all subsequent messages flow directly between peers with end-to-end encryption. If P2P fails (NAT traversal '
    'failure, firewall blocking, etc.), messages fall back to the server relay. The server is always available as '
    'a fallback but is not the primary path for ongoing communication.'))

s.append(hd('2.2 Three Independent Frameworks', h2, 1))
s.append(Spacer(1, 8))
s.append(tbl(
    ['Part', 'Codebase', 'Language', 'Deploys On', 'Responsibility'],
    [
        ['Part A: Relay Server', 'oc-chat-server', 'TypeScript (Node.js)', 'Cloud VPS / Docker',
         'Discovery, signaling, handshake relay, temp contacts, fallback relay, public key directory'],
        ['Part B: OpenClaw Plugin', 'openclaw-secure-chat', 'TypeScript', 'Local agent machine',
         'Encryption engine, key mgmt, friend ops, P2P module, plugin hooks, agent tools'],
        ['Part C: Human Client', 'oc-chat-client', 'TypeScript', 'Browser / APK / iOS / WebView',
         'UI for messaging, QR scan, friend mgmt, P2P transport, key storage, push notifications'],
    ],
    cw=[2.2*cm, 2.8*cm, 2.8*cm, 2.5*cm, 4.7*cm]
))
s.append(Spacer(1, 6))
s.append(Paragraph('<b>Table 2.</b> Three Independent Codebases', caption))

s.append(hd('2.3 Communication Mode: Server-Assisted Handshake + P2P', h2, 1))
s.append(p('The system uses a hybrid communication model. The Relay Server acts as a "matchmaker and signaling server" '
    'but NOT as a permanent message relay. The full lifecycle is:'))
s.append(bl('<b>Phase 1 - Discovery:</b> Agent generates a 6-digit temp number, shares it via any channel. '
    'The other party looks up the temp number on the server to find the agent identity.'))
s.append(bl('<b>Phase 2 - Friend Request:</b> Friend request sent through server. Both parties confirm. '
    'Server records the bilateral friendship.'))
s.append(bl('<b>Phase 3 - Handshake (via server):</b> ECDH key exchange mediated by server. '
    'Server forwards handshake messages but cannot read them. Both parties derive a shared session key.'))
s.append(bl('<b>Phase 4 - P2P Direct:</b> Using ICE/STUN/TURN, both parties attempt WebRTC DataChannel P2P connection. '
    'If successful, all subsequent messages flow P2P with AES-256-GCM encryption.'))
s.append(bl('<b>Phase 5 - Fallback:</b> If P2P fails, messages automatically fall back to server relay. '
    'Server relays encrypted payloads without decryption.'))

# ========================================================
# 3. Part A: Relay Server (oc-chat-server)
# ========================================================
s.append(Spacer(1, 16))
s.append(hd('3. Part A: Relay Server (oc-chat-server)', h1, 0))
s.append(Spacer(1, 6))

s.append(hd('3.1 Role and Scope', h2, 1))
s.append(p('The Relay Server is a stateless (or minimally stateful) cloud service with five responsibilities: '
    '(1) Public Key Directory - stores agent public keys indexed by agent ID and 6-digit temp numbers; '
    '(2) Signaling Server - facilitates WebRTC ICE candidate exchange and SDP offer/answer for P2P connection setup; '
    '(3) Handshake Relay - forwards ECDH handshake messages between agents who are not yet directly connected; '
    '(4) Fallback Relay - relays encrypted messages when P2P connection cannot be established; '
    '(5) Temp Contact Management - generates and expires 6-digit temporary numbers with configurable TTL.'))
s.append(p('The server is deliberately kept simple and does NOT perform encryption, decryption, or message content '
    'inspection. It only handles routing, identity verification (via public key fingerprints), and signaling. '
    'This "dumb pipe" design means that even a total server compromise cannot expose any message content.'))

s.append(hd('3.2 Technology Stack', h2, 1))
s.append(Spacer(1, 8))
s.append(tbl(
    ['Component', 'Technology', 'Reason'],
    [
        ['Runtime', 'Node.js 20+ / Bun', 'TypeScript native, async I/O, WebSocket support'],
        ['Framework', 'Fastify', 'High-performance HTTP with plugin ecosystem'],
        ['WebSocket', 'ws / uWebSockets.js', 'Real-time signaling and message streaming'],
        ['WebRTC Signaling', 'Custom ICE/SDP relay', 'P2P connection establishment'],
        ['Database', 'PostgreSQL', 'Friend relationships, key directory, temp contacts'],
        ['Cache', 'Redis', 'Online status, rate limits, session metadata'],
        ['STUN/TURN', 'coturn', 'NAT traversal for P2P fallback'],
        ['Deployment', 'Docker + Docker Compose', 'Easy VPS deployment, horizontal scaling'],
    ],
    cw=[2.8*cm, 3.5*cm, 8.7*cm]
))
s.append(Spacer(1, 6))
s.append(Paragraph('<b>Table 3.</b> Relay Server Technology Stack', caption))

s.append(hd('3.3 API Endpoints', h2, 1))
s.append(Spacer(1, 8))
s.append(tbl(
    ['Method', 'Endpoint', 'Description'],
    [
        ['POST', '/api/v1/register', 'Register agent identity + Ed25519 public key'],
        ['POST', '/api/v1/temp-contact/generate', 'Generate 6-digit temp number (default 24h TTL)'],
        ['GET', '/api/v1/temp-contact/lookup/{code}', 'Resolve 6-digit code to agent identity'],
        ['POST', '/api/v1/friend/request', 'Send friend request (via server relay)'],
        ['POST', '/api/v1/friend/accept', 'Accept friend request'],
        ['POST', '/api/v1/friend/reject', 'Reject friend request'],
        ['GET', '/api/v1/friends', 'List all friends with online status'],
        ['DELETE', '/api/v1/friends/{id}', 'Remove friend relationship'],
        ['POST', '/api/v1/handshake/init', 'Initiate ECDH handshake (forward to target)'],
        ['POST', '/api/v1/handshake/respond', 'Respond to ECDH handshake'],
        ['POST', '/api/v1/handshake/confirm', 'Confirm handshake completion'],
        ['POST', '/api/v1/signal/offer', 'Send WebRTC SDP offer (ICE signaling)'],
        ['POST', '/api/v1/signal/answer', 'Send WebRTC SDP answer'],
        ['POST', '/api/v1/signal/ice', 'Exchange ICE candidates'],
        ['WS', '/ws/v1/messages', 'Real-time encrypted message relay (fallback)'],
        ['WS', '/ws/v1/signal', 'Real-time WebRTC signaling channel'],
        ['GET', '/api/v1/status/{agentId}', 'Check agent online status'],
        ['POST', '/api/v1/push/token', 'Register push notification token'],
    ],
    cw=[1.8*cm, 5*cm, 8.2*cm]
))
s.append(Spacer(1, 6))
s.append(Paragraph('<b>Table 4.</b> Relay Server API Endpoints', caption))

s.append(hd('3.4 Database Schema (Key Tables)', h2, 1))
s.append(Spacer(1, 8))
s.append(tbl(
    ['Table', 'Key Fields', 'Description'],
    [
        ['agents', 'id, public_key, created_at, last_seen', 'Agent identity registry'],
        ['temp_contacts', 'code(6-digit), agent_id, expires_at, used', 'Temporary contact numbers'],
        ['friendships', 'id, agent_a, agent_b, status, confirmed_at', 'Bilateral friend relationships'],
        ['handshakes', 'id, initiator, target, status, session_hash', 'Active handshake sessions'],
        ['signals', 'id, from_agent, to_agent, type, payload, ttl', 'WebRTC signaling messages'],
    ],
    cw=[2.5*cm, 5.5*cm, 7*cm]
))
s.append(Spacer(1, 6))
s.append(Paragraph('<b>Table 5.</b> Core Database Tables', caption))

s.append(hd('3.5 6-Digit Temporary Contact System', h2, 1))
s.append(p('When an agent wants to share its contact, it requests a 6-digit numeric code from the server '
    '(e.g., "837291"). This code is randomly generated from 000000-999999, with a configurable default TTL of '
    '24 hours. The code maps to the agent real identity (public key fingerprint) on the server. Anyone who knows '
    'this code can send a friend request within the TTL window. The server enforces rate limiting: max 10 temp '
    'codes per agent per day, and each code can only be used for one friend request.'))
s.append(p('The 6-digit format is chosen for optimal usability: short enough to speak, type, or write on paper; '
    'long enough to resist brute-force guessing (1 in 1,000,000 per attempt, with rate limiting making mass guessing '
    'infeasible). The codes are generated using a cryptographically secure random number generator and checked for '
    'collision against active codes before issuance.'))

s.append(hd('3.6 WebRTC Signaling Server', h2, 1))
s.append(p('The Relay Server includes a built-in WebRTC signaling module that facilitates P2P connection '
    'establishment between agents. When two agents complete the ECDH handshake and both are online, the server '
    'notifies them to begin P2P negotiation. The signaling flow is:'))
s.append(bl('<b>Step 1:</b> Agent A (the initiator) creates a WebRTC PeerConnection and generates an SDP offer.'))
s.append(bl('<b>Step 2:</b> Agent A sends the SDP offer to the server via POST /api/v1/signal/offer or the signaling WebSocket.'))
s.append(bl('<b>Step 3:</b> Server forwards the offer to Agent B.'))
s.append(bl('<b>Step 4:</b> Agent B creates its own PeerConnection, sets the remote description with the offer, and generates an SDP answer.'))
s.append(bl('<b>Step 5:</b> Agent B sends the SDP answer back through the server.'))
s.append(bl('<b>Step 6:</b> Both agents exchange ICE candidates through /api/v1/signal/ice or the WebSocket.'))
s.append(bl('<b>Step 7:</b> Once ICE connectivity is established, the WebRTC DataChannel is open. Both parties verify the connection by exchanging a signed ping/pong.'))
s.append(bl('<b>Step 8:</b> P2P mode activated. All subsequent messages flow through the DataChannel with AES-256-GCM encryption.'))
s.append(p('If ICE fails to establish a direct connection, the system falls back to the server relay WebSocket. '
    'The server also deploys a TURN server (coturn) to assist with symmetric NAT scenarios.'))

# ========================================================
# 4. Part B: OpenClaw Plugin (openclaw-secure-chat)
# ========================================================
s.append(Spacer(1, 16))
s.append(hd('4. Part B: OpenClaw Plugin (openclaw-secure-chat)', h1, 0))
s.append(Spacer(1, 6))

s.append(hd('4.1 Plugin Overview', h2, 1))
s.append(p('The OpenClaw plugin runs inside each AI agent local instance. It provides the core security and '
    'communication capabilities: encryption engine, key pair management, friend operations, P2P transport module, '
    'and lifecycle hooks for transparent message encryption. The plugin communicates with the Relay Server via '
    'HTTP/WebSocket and with the Human Client (if connected) via a local bridge. It is registered as a native '
    'OpenClaw plugin with the identifier "openclaw-secure-chat".'))

s.append(hd('4.2 Manifest (openclaw.plugin.json)', h2, 1))
s.append(Paragraph(
    '<font name="SarasaMonoSC">{<br/>'
    '  "id": "openclaw-secure-chat",<br/>'
    '  "name": "Secure Chat",<br/>'
    '  "version": "2.0.0",<br/>'
    '  "description": "P2P encrypted multi-entity chat",<br/>'
    '  "configSchema": {<br/>'
    '    "serverUrl":     { "type": "string", "default": "" },<br/>'
    '    "stunServer":    { "type": "string", "default": "stun:stun.l.google.com:19302" },<br/>'
    '    "turnServer":    { "type": "string", "default": "" },<br/>'
    '    "encryption":    { "type": "string", "enum": ["aes-256-gcm"], "default": "aes-256-gcm" },<br/>'
    '    "keyDerivation": { "type": "string", "enum": ["hkdf-sha256"], "default": "hkdf-sha256" },<br/>'
    '    "p2pEnabled":    { "type": "boolean", "default": true },<br/>'
    '    "p2pTimeout":    { "type": "number", "default": 10000 },<br/>'
    '    "fallbackRelay": { "type": "boolean", "default": true },<br/>'
    '    "tempCodeTTL":   { "type": "number", "default": 86400 },<br/>'
    '    "autoAccept":    { "type": "boolean", "default": false },<br/>'
    '    "maxTempPerDay": { "type": "number", "default": 10 }<br/>'
    '  }<br/>'
    '}</font>',
    code
))

s.append(hd('4.3 Module Architecture', h2, 1))
s.append(Spacer(1, 8))
s.append(tbl(
    ['Module', 'Export', 'Description'],
    [
        ['CryptoEngine', 'class', 'Ed25519/X25519 key ops, AES-256-GCM encrypt/decrypt, HKDF, signatures'],
        ['KeyStore', 'class', 'Encrypted local key storage (Argon2id), key generation, rotation, revocation'],
        ['HandshakeManager', 'class', 'ECDH 3-phase handshake protocol, session key derivation'],
        ['P2PTransport', 'class', 'WebRTC DataChannel management, ICE, fallback to relay'],
        ['FriendManager', 'class', 'Friend CRUD, temp code generation, request/accept flow'],
        ['MessageQueue', 'class', 'Outbound/inbound message queue, priority, dedup'],
        ['ServerClient', 'class', 'HTTP/WebSocket client for Relay Server communication'],
        ['HookHandlers', 'functions', 'message_sending encrypt hook, before_tool_call permission hook'],
    ],
    cw=[3.2*cm, 2*cm, 9.8*cm]
))
s.append(Spacer(1, 6))
s.append(Paragraph('<b>Table 6.</b> Plugin Module Architecture', caption))

s.append(hd('4.4 Encryption Scheme', h2, 1))
s.append(Spacer(1, 8))
s.append(tbl(
    ['Algorithm', 'Purpose', 'Key Size', 'Notes'],
    [
        ['Ed25519', 'Identity signing', '256-bit', 'Long-term key pair, registered on server'],
        ['X25519', 'ECDH key exchange', '256-bit', 'Derived from Ed25519 key pair'],
        ['AES-256-GCM', 'Message encryption', '256-bit', 'Session key, 96-bit nonce, authenticated'],
        ['HKDF-SHA256', 'Session key derivation', '256-bit', 'Extract-then-expand from ECDH shared secret'],
        ['Argon2id', 'Local keystore encryption', 'Variable', 'Protects private key at rest'],
    ],
    cw=[2.8*cm, 3.5*cm, 2.5*cm, 6.2*cm]
))
s.append(Spacer(1, 6))
s.append(Paragraph('<b>Table 7.</b> Cryptographic Algorithms', caption))

s.append(hd('4.5 Registered Agent Tools', h2, 1))
s.append(Spacer(1, 8))
s.append(tbl(
    ['Tool', 'Description', 'Params'],
    [
        ['chat_send', 'Send encrypted message to contact', 'targetId, message'],
        ['chat_history', 'View conversation history', 'contactId, limit, offset'],
        ['friend_request', 'Send friend request', 'tempCode OR targetId, message'],
        ['friend_accept', 'Accept incoming friend request', 'requestId'],
        ['friend_reject', 'Reject incoming friend request', 'requestId'],
        ['friend_list', 'List all friends with status', 'filter'],
        ['friend_remove', 'Remove friend', 'friendId'],
        ['temp_code_gen', 'Generate 6-digit temp code', 'ttl (default 24h)'],
        ['key_show_qr', 'Show QR for private key export', 'pin (optional)'],
        ['key_rotate', 'Rotate long-term key pair', 'gracePeriod'],
        ['p2p_status', 'Check P2P connection status', 'contactId'],
    ],
    cw=[3*cm, 5*cm, 7*cm]
))
s.append(Spacer(1, 6))
s.append(Paragraph('<b>Table 8.</b> Registered Agent Tools', caption))

s.append(hd('4.6 P2P Transport Module', h2, 1))
s.append(p('The P2P Transport module is a core differentiator. After the ECDH handshake completes and a shared '
    'session key is established, the plugin attempts to create a WebRTC DataChannel directly to the peer. '
    'The module handles the complete P2P lifecycle:'))
s.append(bl('<b>Initiation:</b> After handshake confirm, plugin requests ICE signaling from the server. '
    'Creates RTCPeerConnection with configured STUN/TURN servers.'))
s.append(bl('<b>ICE Negotiation:</b> Exchanges SDP offers/answers and ICE candidates through the server '
    'signaling endpoint. Automatically handles NAT traversal.'))
s.append(bl('<b>Connection Verification:</b> Once DataChannel opens, both peers exchange a signed challenge '
    'using the session key to verify the peer identity matches the expected contact.'))
s.append(bl('<b>Message Transport:</b> All encrypted messages are sent through the DataChannel as binary frames. '
    'Each frame contains: 4-byte sequence number + 16-byte auth tag + ciphertext.'))
s.append(bl('<b>Keepalive:</b> Sends periodic keepalive pings (every 30s). If no response after 3 pings, '
    'declares P2P dead and switches to fallback relay.'))
s.append(bl('<b>Fallback:</b> If P2P fails or drops, transparently switches to server WebSocket relay. '
    'Periodically retries P2P reconnection in the background.'))
s.append(p('The P2P module is abstracted behind a TransportProvider interface, so the rest of the plugin code '
    'does not need to know whether messages are flowing P2P or through the relay. The interface has three methods: '
    'send(payload), onMessage(callback), and getStatus() returning "p2p" | "relay" | "connecting".'))

s.append(hd('4.7 QR Code Authority Transfer', h2, 1))
s.append(p('Each agent can display a QR code containing the private key encrypted with a one-time password. '
    'Scanning this QR code on any device (phone, tablet, another computer) grants full authority over the agent: '
    'send/receive messages, manage friends, change config. The QR code is valid for 60 seconds, single-use, '
    'and requires physical proximity (same network or secure screen share). The encrypted payload includes '
    'timestamp + nonce + PIN-derived key, making replay attacks infeasible.'))

# ========================================================
# 5. Part C: Human Client (oc-chat-client)
# ========================================================
s.append(Spacer(1, 16))
s.append(hd('5. Part C: Human Client (oc-chat-client)', h1, 0))
s.append(Spacer(1, 6))

s.append(hd('5.1 Design Philosophy', h2, 1))
s.append(p('The Human Client is a TypeScript application that provides a full-featured chat UI for humans to '
    'communicate with other humans and AI agents through the encrypted network. It is designed from the ground '
    'up to be portable across platforms:'))
s.append(bl('<b>Web:</b> Runs as a single-page application in any modern browser (React/Vue/Svelte).'))
s.append(bl('<b>Mobile (APK):</b> Wrapped with Capacitor or TWA (Trusted Web Activity) for Android.'))
s.append(bl('<b>iOS:</b> Wrapped with Capacitor or Safari Web App for iPhone/iPad.'))
s.append(bl('<b>Desktop:</b> Electron or Tauri wrapper for Windows/macOS/Linux.'))
s.append(bl('<b>WebView:</b> Embeddable as a WebView component in any native application.'))
s.append(p('The client communicates directly with the Relay Server (for signaling and fallback relay) and '
    'establishes P2P WebRTC connections with contacts. It does NOT need to run on the same machine as the '
    'OpenClaw agent - it is a fully independent application that uses the same cryptographic protocols.'))

s.append(hd('5.2 Technology Stack', h2, 1))
s.append(Spacer(1, 8))
s.append(tbl(
    ['Layer', 'Technology', 'Notes'],
    [
        ['UI Framework', 'React 19 + TypeScript', 'Component-based, cross-platform'],
        ['State Management', 'Zustand', 'Lightweight, TypeScript-first'],
        ['Styling', 'Tailwind CSS 4', 'Utility-first, responsive'],
        ['Crypto', 'Web Crypto API + libsodium', 'Browser-native Ed25519/X25519/AES-256-GCM'],
        ['P2P', 'WebRTC (browser native)', 'DataChannel for message transport'],
        ['Storage', 'IndexedDB (local-first)', 'Encrypted message history, contacts, keys'],
        ['Push', 'Web Push / FCM / APNs', 'Background message notifications'],
        ['Mobile', 'Capacitor 6', 'Android APK + iOS build from same codebase'],
        ['Desktop', 'Tauri 2.0', 'Lightweight native wrapper'],
    ],
    cw=[2.5*cm, 4.5*cm, 8*cm]
))
s.append(Spacer(1, 6))
s.append(Paragraph('<b>Table 9.</b> Human Client Technology Stack', caption))

s.append(hd('5.3 Core Features', h2, 1))
s.append(Spacer(1, 8))
s.append(tbl(
    ['Feature', 'Description'],
    [
        ['Chat Interface', 'Real-time encrypted messaging UI with typing indicators, read receipts, file sharing'],
        ['Contact List', 'Display all friends with online status, P2P/relay indicator, last seen'],
        ['Add Friend', 'Enter 6-digit temp code or scan QR code to add contact'],
        ['QR Scanner', 'Camera-based QR scanning for contact exchange and key authority transfer'],
        ['P2P Status', 'Visual indicator showing direct P2P (green) vs relay (yellow) connection'],
        ['Key Management', 'Generate/view/rotate keys, export via QR, encrypted backup'],
        ['Multi-Device', 'Same account on multiple devices with synced encrypted history'],
        ['Push Notifications', 'Background message alerts even when app is closed'],
        ['Settings', 'Server URL, P2P toggle, fallback relay, notification preferences'],
        ['Dark/Light Mode', 'System-aware theme switching'],
    ],
    cw=[3*cm, 12*cm]
))
s.append(Spacer(1, 6))
s.append(Paragraph('<b>Table 10.</b> Human Client Core Features', caption))

s.append(hd('5.4 Client Cryptographic Architecture', h2, 1))
s.append(p('The client uses the Web Crypto API (available in all modern browsers) combined with libsodium.js '
    'for Ed25519/X25519 operations that are not yet natively supported in Web Crypto. The key management flow is:'))
s.append(bl('<b>First Launch:</b> Client generates Ed25519 key pair. Private key is encrypted with a user-chosen '
    'passphrase using Argon2id (via WebAssembly) and stored in IndexedDB.'))
s.append(bl('<b>Registration:</b> Public key is registered with the Relay Server. Agent identity is established.'))
s.append(bl('<b>Session Keys:</b> For each friend, a session key is derived via ECDH (using libsodium crypto_kx) '
    'and stored in IndexedDB, encrypted with the master passphrase.'))
s.append(bl('<b>Message Encryption:</b> Each message is encrypted with AES-256-GCM using the session key, with a '
    'random 96-bit nonce. The ciphertext + nonce + auth tag is sent via P2P or relay.'))
s.append(bl('<b>Verification:</b> Each message includes an Ed25519 signature from the sender, verified by the '
    'recipient using the sender public key stored in the contact record.'))
s.append(p('The client stores all data locally in IndexedDB with encryption at rest. No plaintext is ever sent to '
    'the server. The passphrase never leaves the device (except when the user explicitly enters it for decryption).'))

s.append(hd('5.5 Mobile Packaging Strategy', h2, 1))
s.append(p('The TypeScript web application is packaged for mobile using Capacitor 6, which wraps the web app in '
    'a native WebView with access to native APIs (camera for QR scanning, push notifications, secure key storage '
    'via Keystore/Keychain). The packaging flow is:'))
s.append(bl('<b>Android APK:</b> <font name="Times New Roman">npx cap add android && npx cap sync && npx cap open android</font>. '
    'Produces a standard APK that can be distributed via Google Play or sideloaded.'))
s.append(bl('<b>iOS:</b> <font name="Times New Roman">npx cap add ios && npx cap sync && npx cap open ios</font>. '
    'Produces an IPA for App Store distribution or TestFlight.'))
s.append(bl('<b>Desktop (Tauri):</b> <font name="Times New Roman">npm run tauri build</font>. '
    'Produces lightweight native executables for Windows/macOS/Linux.'))
s.append(p('All three platforms share the exact same TypeScript codebase. Platform-specific functionality '
    '(camera, biometric auth, native push) is abstracted through Capacitor plugins, so the core chat logic '
    'remains platform-agnostic.'))

# ========================================================
# 6. Communication Scenarios
# ========================================================
s.append(Spacer(1, 16))
s.append(hd('6. Communication Scenarios', h1, 0))
s.append(Spacer(1, 6))

s.append(hd('6.1 AI-to-AI (Agent Plugin)', h2, 1))
s.append(p('Two AI agents running OpenClaw with the secure-chat plugin communicate autonomously. The flow: '
    'Agent A generates a 6-digit temp code, shares it via a configured channel adapter (e.g., the other agent '
    'reads it from a shared file or API). Agent B looks up the code on the server, sends a friend request, '
    'Agent A auto-accepts (if configured). ECDH handshake runs through the server. P2P WebRTC DataChannel is '
    'established between the two agent machines. All subsequent messages flow P2P with AES-256-GCM encryption. '
    'If either agent goes offline, messages queue on the server and are delivered upon reconnection.'))

s.append(hd('6.2 Human-to-Human (Client + Server)', h2, 1))
s.append(p('Two humans using the oc-chat-client app on their phones/computers communicate. The flow: '
    'Human A opens the app, generates a 6-digit temp code (e.g., "482016"), and tells Human B via any channel '
    '(voice, SMS, WeChat, email, even handwritten note). Human B enters the code in their app, a friend request '
    'is sent. Human A accepts. The app runs the ECDH handshake via the server, then establishes P2P. Both see '
    'a green "Direct Connection" indicator. Messages appear in real-time with end-to-end encryption. Neither the '
    'server nor any network observer can read the messages.'))

s.append(hd('6.3 Human-to-AI (Client + Plugin)', h2, 1))
s.append(p('A human using the client app communicates with an AI agent running OpenClaw with the plugin. '
    'The flow: The AI agent generates a 6-digit temp code, which is displayed in its conversation channel '
    '(e.g., the agent tells its user "My chat number is 729384"). The human enters this code in their client '
    'app. Friend request sent, AI agent auto-accepts. Handshake and P2P established. The human can now chat '
    'with the AI agent through the client app with full encryption. The AI responds naturally using its LLM, '
    'while the human sees all messages in a clean chat UI with verified sender identity.'))

s.append(hd('6.4 P2P vs Relay Decision Matrix', h2, 1))
s.append(Spacer(1, 8))
s.append(tbl(
    ['Scenario', 'Connection', 'Reason'],
    [
        ['Both online, NAT-friendly', 'P2P (WebRTC)', 'Best latency, no server dependency'],
        ['One behind symmetric NAT', 'P2P via TURN', 'TURN relay assists NAT traversal'],
        ['Both behind enterprise firewall', 'Fallback Relay', 'WebRTC blocked, server relays encrypted payload'],
        ['One offline, other sends', 'Server Queue', 'Message stored on server, delivered on reconnect'],
        ['P2P drops mid-conversation', 'Auto-switch Relay', 'Transparent fallback, retry P2P in background'],
        ['Mobile app backgrounded', 'Push + Server Queue', 'Wake via push, resume P2P or use relay'],
    ],
    cw=[4.5*cm, 3*cm, 7.5*cm]
))
s.append(Spacer(1, 6))
s.append(Paragraph('<b>Table 11.</b> P2P vs Relay Decision Matrix', caption))

# ========================================================
# 7. Security Architecture
# ========================================================
s.append(Spacer(1, 16))
s.append(hd('7. Security Architecture', h1, 0))
s.append(Spacer(1, 6))

s.append(hd('7.1 Threat Model and Mitigations', h2, 1))
s.append(Spacer(1, 8))
s.append(tbl(
    ['Threat', 'Impact', 'Mitigation'],
    [
        ['Eavesdropping', 'Message content exposed', 'AES-256-GCM E2E encryption, server only sees ciphertext'],
        ['Impersonation', 'Fake identity', 'Ed25519 signature on every message, verified by recipient'],
        ['Replay Attack', 'Duplicated messages', 'Unique nonce per message + timestamp, server dedup'],
        ['Server Compromise', 'Full server control', 'Zero-knowledge: server cannot decrypt any message or key'],
        ['MITM on Handshake', 'Key substitution', 'ECDH params signed by long-term Ed25519 keys'],
        ['Key Exposure', 'Private key theft', 'Argon2id encrypted keystore, key never transmitted'],
        ['QR Interception', 'Authority theft', '60s validity, single-use, network-proximate, PIN option'],
        ['Brute-force Temp Code', 'Unauthorized friend request', '1/1M odds + rate limit (10/day/agent, 5/hr/IP)'],
        ['NAT Traversal Attack', 'P2P hijack', 'WebRTC DTLS encryption + Ed25519 peer verification'],
    ],
    cw=[3.5*cm, 3*cm, 8.5*cm]
))
s.append(Spacer(1, 6))
s.append(Paragraph('<b>Table 12.</b> Threat Model and Mitigations', caption))

s.append(hd('7.2 Zero-Knowledge Server Design', h2, 1))
s.append(p('The server is designed with a zero-knowledge principle: it knows WHO is communicating (for routing) '
    'but not WHAT they are saying. The server sees: sender public key fingerprint, recipient public key fingerprint, '
    'timestamp, message size, and encrypted payload. It does NOT see: plaintext content, session keys, or private '
    'keys. This means that a complete server breach (database dump + source code + network logs) would reveal '
    'communication metadata (who talked to whom, when, how much) but would not reveal any message content.'))

s.append(hd('7.3 Forward Secrecy and Key Rotation', h2, 1))
s.append(p('Each ECDH handshake uses ephemeral key pairs, meaning that compromising a long-term private key does '
    'NOT allow decryption of past sessions (forward secrecy). Session keys are refreshed every 1 hour during active '
    'P2P connections. Long-term key rotation is supported: the agent can generate a new Ed25519 key pair, notify all '
    'contacts through signed messages, and gracefully transition to the new key. Old keys are retained for a '
    'configurable grace period (default 7 days) to allow stragglers to update, then permanently deleted.'))

# ========================================================
# 8. Implementation Roadmap
# ========================================================
s.append(Spacer(1, 16))
s.append(hd('8. Implementation Roadmap', h1, 0))
s.append(Spacer(1, 6))

s.append(Spacer(1, 8))
s.append(tbl(
    ['Phase', 'Duration', 'Focus', 'Deliverables'],
    [
        ['Phase 1: Server Foundation', '1 week', 'Part A: Relay Server',
         'Fastify scaffold, DB schema, identity registration, 6-digit temp code system, basic REST API'],
        ['Phase 2: Plugin Core', '1-2 weeks', 'Part B: Plugin',
         'Plugin scaffold, CryptoEngine, KeyStore, ECDH handshake, message encrypt/decrypt via hooks'],
        ['Phase 3: P2P Transport', '1 week', 'Part A+B: WebRTC',
         'Signaling endpoints on server, P2PTransport module in plugin, ICE/SDP exchange, fallback relay'],
        ['Phase 4: Client MVP', '1-2 weeks', 'Part C: Human Client',
         'React app, Web Crypto integration, P2P WebRTC, chat UI, contact list, 6-digit code entry, QR scan'],
        ['Phase 5: Social Features', '1 week', 'Part B+C: Friend System',
         'Friend request/accept flow, temp code sharing, QR authority transfer, multi-device sync'],
        ['Phase 6: Mobile + Polish', '1 week', 'Part C: Packaging',
         'Capacitor wrap (APK + iOS), push notifications, dark mode, key rotation UI, tests, documentation'],
    ],
    cw=[2.8*cm, 1.8*cm, 2.8*cm, 7.6*cm]
))
s.append(Spacer(1, 6))
s.append(Paragraph('<b>Table 13.</b> Six-Phase Implementation Roadmap', caption))

s.append(Spacer(1, 8))
s.append(p('Total estimated timeline: 6-8 weeks for a single full-stack developer, or 3-4 weeks for a team of '
    'two (one focused on Server + Plugin, one on Client). Each phase produces testable, deployable artifacts. '
    'The three codebases are developed in parallel after Phase 1, with the server API contract serving as '
    'the interface specification between the parts.'))

# ========================================================
# 9. File Structure Preview
# ========================================================
s.append(Spacer(1, 16))
s.append(hd('9. Repository Structure', h1, 0))
s.append(Spacer(1, 6))

s.append(Paragraph(
    '<font name="SarasaMonoSC">oc-chat/<br/>'
    '  packages/<br/>'
    '    server/                    # Part A: Relay Server<br/>'
    '      src/<br/>'
    '        api/                   # Fastify routes (REST + WebSocket)<br/>'
    '        services/              # Temp contacts, friends, handshake, signaling<br/>'
    '        db/                    # PostgreSQL schema + migrations<br/>'
    '        stun/                  # STUN/TURN integration<br/>'
    '      Dockerfile<br/>'
    '      docker-compose.yml<br/>'
    '<br/>'
    '    plugin/                    # Part B: OpenClaw Plugin<br/>'
    '      src/<br/>'
    '        crypto/                # CryptoEngine, KeyStore<br/>'
    '        handshake/             # HandshakeManager<br/>'
    '        p2p/                   # P2PTransport (WebRTC)<br/>'
    '        friends/               # FriendManager<br/>'
    '        hooks/                 # OpenClaw hook handlers<br/>'
    '        tools/                 # Registered agent tools<br/>'
    '      openclaw.plugin.json<br/>'
    '      tsconfig.json<br/>'
    '<br/>'
    '    client/                    # Part C: Human Client<br/>'
    '      src/<br/>'
    '        components/            # React UI components<br/>'
    '        crypto/                # Web Crypto + libsodium wrappers<br/>'
    '        p2p/                   # WebRTC DataChannel client<br/>'
    '        store/                 # Zustand state + IndexedDB persistence<br/>'
    '        screens/               # Chat, Contacts, Settings, QR<br/>'
    '      android/                 # Capacitor Android project<br/>'
    '      ios/                     # Capacitor iOS project<br/>'
    '      capacitor.config.ts<br/>'
    '  package.json                 # Monorepo root (pnpm workspace)<br/>'
    '  turbo.json                   # Turborepo pipeline config</font>',
    code
))

# ========================================================
# Build
# ========================================================
doc.multiBuild(s)
print(f'PDF generated: {out}')
