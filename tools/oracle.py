"""Unicorn oracle: runs the original menu routine (unit seg 0x314, entry 4e1c) of the
unpacked MDP v1.0 image with a planar VGA model. Used to produce reference states
for the JS port.  usage: oracle.py MDP10.EXE MDP.MDI out.json [key@frame ...]
key is a scancode name: down up pgdn pgup enter esc f10 (frame = vsync count)"""
import sys, struct, json, hashlib
from unicorn import *
from unicorn.x86_const import *

exe, mdi, out = sys.argv[1:4]
script = sorted((int(a.split('@')[1]), a.split('@')[0]) for a in sys.argv[4:] if not a.startswith(('snap','full')))
FULL = set(int(a.split('@')[1]) for a in sys.argv[4:] if a.startswith('full'))
SNAP = set(int(a.split('@')[1]) for a in sys.argv[4:] if a.startswith('snap'))
KEYS = dict(down=0x5000, up=0x4800, pgdn=0x5100, pgup=0x4900, enter=0x1c0d, esc=0x011b, f10=0x4400)
BASE = 0x1000
d = open(exe, 'rb').read()
h = struct.unpack('<14H', d[:28])
img = bytearray(d[h[4]*16:])
for i in range(h[3]):
    o, s = struct.unpack('<HH', d[h[12]+4*i:h[12]+4*i+4])
    a = s*16+o
    struct.pack_into('<H', img, a, (struct.unpack_from('<H', img, a)[0] + BASE) & 0xffff)
mdi_bytes = open(mdi, 'rb').read()

uc = Uc(UC_ARCH_X86, UC_MODE_16)
uc.mem_map(0, 0xA0000)
uc.mem_map(0xB0000, 0x50000)
uc.mem_write(BASE*16, bytes(img))
UNIT = 0x314 + BASE

planes = [bytearray(0x10000) for _ in range(4)]
latch = [0]*4
seq = [0]*8; seq[2] = 0xf
gc = [0]*9; gc[8] = 0xff
crtc = [0]*0x20
dac = []; dac_idx = 0
attr_ff = 0
state = dict(seqi=0, gci=0, crtci=0, vs=0, frame=0, keys=list(script), kq=[], shot=[], dac_log=[])

def vread(uc, off, size, _):
    v = 0
    for i in range(size):
        o = (off+i) & 0xffff
        for p in range(4): latch[p] = planes[p][o]
        v |= planes[gc[4] & 3][o] << (8*i)
    return v
def vwrite(uc, off, size, val, _):
    for i in range(size):
        o = (off+i) & 0xffff; b = (val >> (8*i)) & 0xff
        for p in range(4):
            if seq[2] >> p & 1: planes[p][o] = b
uc.mmio_map(0xA0000, 0x10000, vread, None, vwrite, None)

def snapshot(tag):
    state['shot'].append(dict(tag=tag, frame=state['frame'], start=(crtc[0xc] << 8) | crtc[0xd],
        lc=crtc[0x18] | ((crtc[7] >> 4 & 1) << 8) | ((crtc[9] >> 6 & 1) << 9),
        hde=crtc[1], offset=crtc[0x13], dac=list(dac[:48]),
        md5=[hashlib.md5(bytes(p)).hexdigest() for p in planes],
        planes=[bytes(p).hex() for p in planes] if state['frame'] in FULL else None))

def out_cb(uc, port, size, val, _):
    global dac_idx, attr_ff
    if size == 2 and port in (0x3c4, 0x3ce, 0x3d4):
        out_cb(uc, port, 1, val & 0xff, _); out_cb(uc, port+1, 1, val >> 8, _); return
    if port == 0x3c4: state['seqi'] = val & 0x1f
    elif port == 0x3c5: seq[state['seqi'] & 7] = val
    elif port == 0x3ce: state['gci'] = val & 0xf
    elif port == 0x3cf:
        if state['gci'] < 9: gc[state['gci']] = val
    elif port == 0x3d4: state['crtci'] = val & 0x1f
    elif port == 0x3d5: crtc[state['crtci']] = val
    elif port == 0x3c8: dac_idx = val * 3; del dac[dac_idx:]
    elif port == 0x3c9:
        if dac_idx >= len(dac): dac.extend([0]*(dac_idx-len(dac)+1))
        dac[dac_idx] = val & 0x3f; dac_idx += 1
    elif port == 0x3c0: attr_ff ^= 1
def in_cb(uc, port, size, _):
    global attr_ff
    if port == 0x3da:
        attr_ff = 0
        state['vs'] ^= 1
        if not state['vs'] and state.get('fresh'):
            state['fresh'] = False
            if not SNAP or state['frame'] in SNAP: snapshot('v')
        if state['vs']:
            state['frame'] += 1
            state['fresh'] = True
            while state['keys'] and state['keys'][0][0] <= state['frame']:
                state['kq'].append(KEYS[state['keys'].pop(0)[1]])
            if state['frame'] > FRAMES: uc.emu_stop()
        return 8 if state['vs'] else 0
    if port == 0x3d5: return crtc[state['crtci']]
    return 0
uc.hook_add(UC_HOOK_INSN, out_cb, None, 1, 0, UC_X86_INS_OUT)
uc.hook_add(UC_HOOK_INSN, in_cb, None, 1, 0, UC_X86_INS_IN)
FRAMES = max([s[0] for s in script] + [0]) + 30

fh = dict(pos=0)
def intr(uc, n, _):
    ax = uc.reg_read(UC_X86_REG_AX); ah = ax >> 8
    if n == 0x10:
        if ax == 0x12:
            for p in planes: p[:] = bytes(0x10000)
            for i in range(0x20): crtc[i] = 0
            crtc[1] = 0x4f; crtc[0x13] = 0x28
            state['dac_reset'] = 1
    elif n == 0x16:
        fl = uc.reg_read(UC_X86_REG_EFLAGS)
        if ah == 1:
            fl = (fl | 0x40) if not state['kq'] else (fl & ~0x40)
            if state['kq']: uc.reg_write(UC_X86_REG_AX, state['kq'][0])
        elif ah == 0:
            k = state['kq'].pop(0) if state['kq'] else 0
            uc.reg_write(UC_X86_REG_AX, k)
        # write flags back into stacked FLAGS (iret frame): sp+4
        ss = uc.reg_read(UC_X86_REG_SS); sp = uc.reg_read(UC_X86_REG_SP)
        sf = struct.unpack('<H', uc.mem_read(ss*16+sp+4, 2))[0]
        sf = (sf | 0x40) if (fl & 0x40) else (sf & ~0x40)
        uc.mem_write(ss*16+sp+4, struct.pack('<H', sf))
    elif n == 0x21:
        ds = uc.reg_read(UC_X86_REG_DS); dx = uc.reg_read(UC_X86_REG_DX)
        cx = uc.reg_read(UC_X86_REG_CX)
        if ah == 0x3d: uc.reg_write(UC_X86_REG_AX, 5); fh['pos'] = 0; clr(uc)
        elif ah == 0x3f:
            chunk = mdi_bytes[fh['pos']:fh['pos']+cx]; fh['pos'] += len(chunk)
            uc.mem_write(ds*16+dx, chunk); uc.reg_write(UC_X86_REG_AX, len(chunk)); clr(uc)
        elif ah == 0x3e: clr(uc)
        else: print('int21', hex(ax), file=sys.stderr)
def clr(uc):
    ss = uc.reg_read(UC_X86_REG_SS); sp = uc.reg_read(UC_X86_REG_SP)
    sf = struct.unpack('<H', uc.mem_read(ss*16+sp+4, 2))[0] & ~1
    uc.mem_write(ss*16+sp+4, struct.pack('<H', sf))
uc.hook_add(UC_HOOK_INTR, intr)

# IVT: every vector -> IRET stub at 0x500 so int hooks fire
uc.mem_write(0x500, b'\xcf'); uc.mem_write(0x501, b'\xf4')
for v in range(256): uc.mem_write(v*4, struct.pack('<HH', 0x500, 0))
uc.reg_write(UC_X86_REG_SS, 0x50); uc.reg_write(UC_X86_REG_SP, 0xff00)
# far return address -> HLT at 0:0x501
uc.mem_write(0x50*16+0xfefc, struct.pack('<HH', 0x501, 0))
uc.reg_write(UC_X86_REG_SP, 0xfefc)
uc.reg_write(UC_X86_REG_CS, UNIT); uc.reg_write(UC_X86_REG_DS, UNIT); uc.reg_write(UC_X86_REG_ES, UNIT)
try:
    uc.emu_start(UNIT*16 + 0x4e1c, 0, count=400_000_000)
except UcError as e:
    print('uc error', e, hex(uc.reg_read(UC_X86_REG_IP)), file=sys.stderr)
snapshot('end')
ret = (uc.reg_read(UC_X86_REG_AX), uc.reg_read(UC_X86_REG_DX))
print('frames', state['frame'], 'ret ax,dx', [hex(x) for x in ret], 'shots', len(state['shot']))
json.dump(state['shot'], open(out, 'w'))
