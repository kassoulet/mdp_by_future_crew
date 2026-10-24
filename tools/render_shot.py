import sys, json
import numpy as np
from PIL import Image
def render(s, W=512, H=480, stride=None):
    stride = stride or s['offset']*2
    planes = [np.frombuffer(bytes.fromhex(p), np.uint8) for p in s['planes']]
    dac = np.array(s['dac'] + [0]*(48-len(s['dac'])), np.uint8).reshape(16, 3)
    rgb = (dac.astype(int)*255//63).astype(np.uint8)
    out = np.zeros((H, W), np.uint8)
    for L in range(H):
        a = s['start'] + L*stride if L <= s['lc'] else (L-s['lc']-1)*stride
        row = [p[(a+np.arange(W//8)) & 0xffff] for p in planes]
        for p in range(4):
            out[L] |= (np.unpackbits(row[p]) << p).astype(np.uint8)
    return rgb[out]
if __name__ == '__main__':
    shots = json.load(open(sys.argv[1])); n = int(sys.argv[2])
    s = shots[n]; print({k: v for k, v in s.items() if k != 'planes'})
    Image.fromarray(render(s)).save(sys.argv[3])
