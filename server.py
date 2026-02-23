#!/usr/bin/env python3
# OpenClaw Agent Live Dashboard (log-driven, no external deps)

import json
import os
import time
import threading
import mimetypes
import re
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(HERE, 'web')
CONFIG_PATH = os.path.join(HERE, 'config.json')

WORKSPACE_DIR = os.path.dirname(os.path.dirname(HERE))
DEFAULT_IDENTITY_PATH = os.path.join(WORKSPACE_DIR, 'IDENTITY.md')

_app_config = {}

DEFAULT_CONFIG = {
    'host': '127.0.0.1',
    'port': 8787,
    'log_path': '',
    'poll_interval_ms': 250,
    'idle_after_sec': 60,
    'identity_path': ''
}

def parse_identity():
    """Read IDENTITY.md (OpenClaw workspace) and expose {name, appearance} to the UI."""
    result = {'name': 'Mia', 'appearance': ''}

    # Resolve identity path with sensible fallbacks
    candidates = []
    cfg_path = (_app_config.get('identity_path', '') or '').strip()
    if cfg_path:
        candidates.append(cfg_path)
    candidates.extend([
        DEFAULT_IDENTITY_PATH,
        os.path.join(HERE, 'IDENTITY.md'),
        os.path.join(os.getcwd(), 'IDENTITY.md'),
        os.path.join(os.path.expanduser('~'), '.openclaw', 'workspace', 'IDENTITY.md'),
    ])
    identity_path = next((p for p in candidates if p and os.path.isfile(p)), '')

    if not identity_path:
        return result

    try:
        with open(identity_path, 'r', encoding='utf-8') as f:
            text = f.read()
    except Exception:
        return result

    # --- Name ---
    name_patterns = [
        r'\*\*Name:\*\*\s*(.+)',
        r'\*\*名字[:：]\*\*\s*(.+)',
        r'^\s*Name\s*[:：]\s*(.+)$',
        r'^\s*名字\s*[:：]\s*(.+)$',
    ]
    for pat in name_patterns:
        m = re.search(pat, text, flags=re.MULTILINE)
        if m:
            result['name'] = m.group(1).strip()
            break

    # --- Appearance section ---
    def _section_by_heading(headings):
        # headings: list[str], e.g. ["外觀","Appearance"]
        h_pat = r'^(?:#{2,3})\s*(?:' + '|'.join([re.escape(h) for h in headings]) + r')\s*$'
        m = re.search(h_pat, text, flags=re.MULTILINE | re.IGNORECASE)
        if not m:
            return ''
        start = m.end()
        # capture until next heading of same/higher level
        m2 = re.search(r'^#{2,3}\s+.+$', text[start:], flags=re.MULTILINE)
        end = start + (m2.start() if m2 else len(text[start:]))
        return text[start:end].strip()

    appearance = _section_by_heading(['外觀', '外型', '外貌', 'Appearance'])
    if not appearance:
        # inline style: **Appearance:** ...
        m = re.search(r'\*\*Appearance[:：]\*\*\s*(.+)', text)
        if m:
            appearance = m.group(1).strip()

    if not appearance:
        # fallback: collect the most relevant lines
        lines = []
        for ln in text.splitlines():
            if any(k in ln for k in ['髮', '頭髮', '眼', '膚', '耳環', '服裝', 'dress', 'hair', 'eye', 'skin', 'earring']):
                lines.append(ln.strip())
        appearance = '\n'.join(lines[:40]).strip()

    result['appearance'] = appearance
    return result


RE_QUEUEAHEAD = re.compile(r'queueAhead=(\d+)')
RE_WAITEDMS = re.compile(r'waitedMs=(\d+)')
RE_TIMEOUTMS = re.compile(r'timeoutMs=(\d+)')
RE_TTFT = re.compile(r'TTFT\s*=?\s*(\d+)\s*ms', re.IGNORECASE)
RE_TPS = re.compile(r'TPS\s*=?\s*([\d\.]+)', re.IGNORECASE)

def classify_line(line):
    s = line.strip()
    if not s:
        return None
    event = {'raw': s, 'ts': time.time()}
    try:
        data = json.loads(s)
        msg_type = data.get('type', '')
        if msg_type == 'message':
            msg = data.get('message', {})
            role = msg.get('role', '')
            content = msg.get('content', [])
            if role == 'user':
                event['type'] = 'working'
                for item in content:
                    if item.get('type') == 'text':
                        event['raw'] = '[user] ' + item.get('text', '')[:50]
                        break
                return event
            if role == 'assistant':
                for item in content:
                    if item.get('type') == 'toolCall':
                        event['type'] = 'working'
                        event['raw'] = '[tools] ' + item.get('name', '')
                        return event
                    if item.get('type') == 'thinking':
                        event['type'] = 'working'
                        return event
                    if item.get('type') == 'text':
                        event['type'] = 'working'
                        event['raw'] = '[assistant] ' + item.get('text', '')[:50]
                        return event
                return None
        if msg_type == 'model_change':
            event['type'] = 'working'
            event['raw'] = '[model] ' + data.get('modelId', 'unknown')
            return event
        if msg_type == 'custom':
            if data.get('customType', '') == 'model-snapshot':
                event['type'] = 'working'
                event['raw'] = '[model] ' + str(data.get('data', {}).get('modelId', 'snapshot'))
                return event
            return None
        return None
    except (json.JSONDecodeError, TypeError):
        pass
    if 'No API key found' in s:
        event['type'] = 'misconfigured'
        return event
    if 'HTTP 429' in s or 'Too Many Requests' in s:
        event['type'] = 'rate_limited'
        return event
    if '[tools]' in s and 'exec failed' in s:
        event['type'] = 'tool_error'
        return event
    if 'queueAhead=' in s:
        event['type'] = 'queued'
        m = RE_QUEUEAHEAD.search(s)
        if m:
            event['queueAhead'] = int(m.group(1))
        m = RE_WAITEDMS.search(s)
        if m:
            event['waitedMs'] = int(m.group(1))
        return event
    if 'timed out' in s:
        event['type'] = 'timeout'
        return event
    if '[agent/embedded]' in s or 'LLM request' in s:
        event['type'] = 'working'
        return event
    if '[diagnostic]' in s:
        event['type'] = 'diagnostic'
        return event
    return None

def resolve_log_file(path):
    path = (path or '').strip().strip('"').strip("'")
    candidates = []
    if path:
        if os.path.isfile(path):
            return path
        if os.path.isdir(path):
            for root, _, files in os.walk(path):
                for fn in files:
                    if fn.lower().endswith(('.log', '.txt', '.jsonl')):
                        full = os.path.join(root, fn)
                        try:
                            candidates.append((os.path.getmtime(full), full))
                        except:
                            pass
            if candidates:
                candidates.sort(reverse=True)
                return candidates[0][1]
    home = os.path.expanduser('~')
    for gd in [os.path.join(home, '.openclaw', 'agents', 'main', 'sessions'),
               os.path.join(home, '.openclaw', 'logs'),
               os.path.join(home, '.openclaw')]:
        if os.path.isdir(gd):
            for root, _, files in os.walk(gd):
                for fn in files:
                    if fn.lower().endswith(('.log', '.jsonl')):
                        full = os.path.join(root, fn)
                        try:
                            candidates.append((os.path.getmtime(full), full))
                        except:
                            pass
    if candidates:
        candidates.sort(reverse=True)
        return candidates[0][1]
    return ''

class EventBus:
    def __init__(self):
        self._subs = []
        self._lock = threading.Lock()
    def subscribe(self):
        q = []
        with self._lock:
            self._subs.append(q)
        return q
    def unsubscribe(self, q):
        with self._lock:
            try:
                self._subs.remove(q)
            except ValueError:
                pass
    def publish(self, event):
        with self._lock:
            for q in list(self._subs):
                if len(q) > 200:
                    del q[:50]
                q.append(event)

class Tailer(threading.Thread):
    daemon = True
    def __init__(self, bus, config):
        super().__init__()
        self.bus = bus
        self.config = config
        self._stop = threading.Event()
        self.last_event_ts = 0.0
        self.status = {'state': 'idle', 'since': time.time(), 'log_file': '', 'queueAhead': 0, 'waitedMs': 0, 'ttft_ms': None, 'tps': None, 'lastLine': ''}
    def stop(self):
        self._stop.set()
    def _set_state(self, state):
        if self.status['state'] != state:
            self.status['state'] = state
            self.status['since'] = time.time()
    def run(self):
        poll = max(0.05, float(self.config.get('poll_interval_ms', 250)) / 1000.0)
        idle_after = max(2.0, float(self.config.get('idle_after_sec', 60)))
        self.status['log_file'] = resolve_log_file(self.config.get('log_path', ''))
        fh = None
        pos = 0
        last_scan_ts = 0.0
        scan_interval = 1.0  # seconds

        def open_file(fp_override=None, start_at_end=True):
            nonlocal fh, pos
            fp = fp_override or resolve_log_file(self.config.get('log_path', ''))
            self.status['log_file'] = fp
            if not fp:
                return False
            try:
                fh = open(fp, 'rb')
                if start_at_end:
                    fh.seek(0, os.SEEK_END)
                    pos = fh.tell()
                else:
                    fh.seek(0, os.SEEK_SET)
                    pos = 0
                return True
            except:
                fh = None
                return False
        if not open_file():
            self._set_state('no_log')
            self.bus.publish({'type': 'status', 'status': self.status.copy(), 'ts': time.time()})
        while not self._stop.is_set():
            # Auto-switch to newest session log file without restarting the server
            now_scan = time.time()
            if fh and (now_scan - last_scan_ts) >= scan_interval:
                last_scan_ts = now_scan
                latest_fp = resolve_log_file(self.config.get('log_path', ''))
                if latest_fp and latest_fp != self.status.get('log_file', ''):
                    try:
                        fh.close()
                    except:
                        pass
                    fh = None
                    pos = 0
                    self.last_event_ts = 0.0
                    self.status['queueAhead'] = 0
                    self.status['waitedMs'] = 0
                    self.status['ttft_ms'] = None
                    self.status['tps'] = None
                    self.status['lastLine'] = ''
                    if open_file(latest_fp, start_at_end=False):
                        self._set_state('idle')
                    else:
                        self._set_state('no_log')
                    self.bus.publish({'type': 'status', 'status': self.status.copy(), 'ts': time.time()})
                    time.sleep(0.05)
                    continue

            if not fh:
                if open_file():
                    self._set_state('idle')
                    self.bus.publish({'type': 'status', 'status': self.status.copy(), 'ts': time.time()})
                else:
                    self._set_state('no_log')
                    self.bus.publish({'type': 'status', 'status': self.status.copy(), 'ts': time.time()})
                time.sleep(1.0)
                continue
            try:
                fh.seek(pos)
                chunk = fh.read()
                if chunk:
                    pos = fh.tell()
                    text = chunk.decode('utf-8', errors='replace')
                    for line in text.splitlines():
                        ev = classify_line(line)
                        if not ev:
                            continue
                        self.last_event_ts = ev['ts']
                        self.status['lastLine'] = ev.get('raw', '')
                        t = ev['type']
                        if t == 'queued':
                            self._set_state('queued')
                            self.status['queueAhead'] = int(ev.get('queueAhead', 0) or 0)
                            self.status['waitedMs'] = int(ev.get('waitedMs', 0) or 0)
                        elif t == 'rate_limited':
                            self._set_state('rate_limited')
                        elif t == 'misconfigured':
                            self._set_state('misconfigured')
                        elif t in ('timeout', 'tool_error'):
                            self._set_state('warning')
                        elif t in ('working', 'diagnostic'):
                            self._set_state('working')
                            if 'ttft_ms' in ev:
                                self.status['ttft_ms'] = ev['ttft_ms']
                            if 'tps' in ev:
                                self.status['tps'] = ev['tps']
                        self.bus.publish(ev)
                now = time.time()
                if self.status['state'] not in ('no_log', 'misconfigured', 'rate_limited') and self.last_event_ts > 0:
                    if (now - self.last_event_ts) >= idle_after and self.status['state'] != 'idle':
                        self._set_state('idle')
                        self.bus.publish({'type': 'status', 'status': self.status.copy(), 'ts': time.time()})
                time.sleep(poll)
            except FileNotFoundError:
                try:
                    fh.close()
                except:
                    pass
                fh = None
                self._set_state('no_log')
                self.bus.publish({'type': 'status', 'status': self.status.copy(), 'ts': time.time()})
                time.sleep(1.0)
            except Exception as e:
                self._set_state('warning')
                self.bus.publish({'type': 'warning', 'message': str(e), 'ts': time.time()})
                time.sleep(0.5)

def load_config():
    cfg = DEFAULT_CONFIG.copy()
    if os.path.isfile(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                user_cfg = json.load(f)
            if isinstance(user_cfg, dict):
                cfg.update(user_cfg)
        except:
            pass
    return cfg

def save_config(partial):
    cfg = load_config()
    for k, v in (partial or {}).items():
        if k in DEFAULT_CONFIG:
            cfg[k] = v
    with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    return cfg

class Handler(BaseHTTPRequestHandler):
    server_version = 'OpenClawDashboard/1.0'
    def handle(self):
        try:
            super().handle()
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError, OSError):
            return
    def _send(self, code, body, ctype):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)
    def _send_json(self, code, obj):
        data = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self._send(code, data, 'application/json; charset=utf-8')
    def do_GET(self):
        path = urlparse(self.path).path
        if path == '/api/identity':
            self._send_json(200, parse_identity())
            return
        if path == '/api/config':
            self._send_json(200, self.server.app['config'])
            return
        if path == '/api/status':
            self._send_json(200, self.server.app['tailer'].status)
            return
        if path == '/events':
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Connection', 'keep-alive')
            self.end_headers()
            q = self.server.app['bus'].subscribe()
            self._sse_send({'type': 'status', 'status': self.server.app['tailer'].status.copy(), 'ts': time.time()})
            try:
                last_keep = time.time()
                while True:
                    while q:
                        self._sse_send(q.pop(0))
                    if time.time() - last_keep >= 5.0:
                        self._sse_send({'type': 'keepalive', 'ts': time.time()})
                        last_keep = time.time()
                    time.sleep(0.1)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
                pass
            finally:
                self.server.app['bus'].unsubscribe(q)
            return
        if path == '/' or path.startswith('/web/'):
            rel = path[1:] if path != '/' else 'web/index.html'
            if rel == 'web/':
                rel = 'web/index.html'
            fs_path = os.path.join(HERE, rel.replace('/', os.sep))
            if os.path.isdir(fs_path):
                fs_path = os.path.join(fs_path, 'index.html')
            if not os.path.isfile(fs_path):
                self._send(404, b'Not Found', 'text/plain; charset=utf-8')
                return
            with open(fs_path, 'rb') as f:
                data = f.read()
            ctype, _ = mimetypes.guess_type(fs_path)
            if not ctype:
                ctype = 'application/octet-stream'
            if ctype.startswith('text/'):
                ctype += '; charset=utf-8'
            self._send(200, data, ctype)
            return
        self._send(404, b'Not Found', 'text/plain; charset=utf-8')
    def do_POST(self):
        if urlparse(self.path).path == '/api/config':
            length = int(self.headers.get('Content-Length', '0') or 0)
            raw = self.rfile.read(length) if length > 0 else b'{}'
            try:
                payload = json.loads(raw.decode('utf-8', errors='replace'))
            except:
                payload = {}
            cfg = save_config(payload if isinstance(payload, dict) else {})
            self.server.app['config'] = cfg
            global _app_config
            _app_config = cfg
            self._send_json(200, cfg)
            return
        self._send(404, b'Not Found', 'text/plain; charset=utf-8')
    def log_message(self, format, *args):
        return
    def _sse_send(self, obj):
        msg = ('data: ' + json.dumps(obj, ensure_ascii=False) + '\n\n').encode('utf-8')
        try:
            self.wfile.write(msg)
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            raise

def main():
    global _app_config
    cfg = load_config()
    _app_config = cfg
    bus = EventBus()
    tailer = Tailer(bus, cfg)
    tailer.start()
    httpd = ThreadingHTTPServer((cfg['host'], int(cfg['port'])), Handler)
    httpd.app = {'config': cfg, 'bus': bus, 'tailer': tailer}
    print(f"[OpenClaw Dashboard] http://{cfg['host']}:{cfg['port']}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("Shutting down...")
        tailer.stop()
        httpd.shutdown()

if __name__ == '__main__':
    main()
