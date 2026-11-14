"""Tiny software renderer for low-poly style frames: mesh container, rasterizer, deferred shading."""
import numpy as np, cv2, math

# ---------- small math helpers ----------
def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)

def lerp(a, b, t):
    return a + (b - a) * t

def norm(v):
    v = np.asarray(v, float)
    return v / (np.linalg.norm(v, axis=-1, keepdims=True) + 1e-12)

def _hash(ix, iz, seed):
    n = ix.astype(np.int64) * 374761393 + iz.astype(np.int64) * 668265263 + seed * 982451653
    n = (n ^ (n >> 13)) * 1274126177
    n = n ^ (n >> 16)
    return (n & 0xFFFFFF) / float(0xFFFFFF)

def vnoise(x, z, seed=0):
    """Smooth value noise in [0,1]."""
    x = np.asarray(x, float); z = np.asarray(z, float)
    ix = np.floor(x); iz = np.floor(z)
    fx = x - ix; fz = z - iz
    fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz)
    a = _hash(ix, iz, seed); b = _hash(ix + 1, iz, seed)
    c = _hash(ix, iz + 1, seed); d = _hash(ix + 1, iz + 1, seed)
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fz)

def fbm(x, z, octaves=4, seed=0):
    s = 0.0; amp = 0.5; f = 1.0; tot = 0.0
    for o in range(octaves):
        s = s + amp * vnoise(x * f, z * f, seed + o * 17); tot += amp
        amp *= 0.5; f *= 2.03
    return s / tot

# ---------- mesh container ----------
class Mesh:
    """Collects triangles with per-face albedo, emissive strength and material id."""
    def __init__(self):
        self.V = []; self.F = []; self.A = []; self.E = []; self.M = []; self.n = 0

    def add(self, verts, faces, alb, emis=0.0, mat=0, orient='out'):
        verts = np.asarray(verts, float).reshape(-1, 3); faces = np.asarray(faces, int).reshape(-1, 3)
        a, b, c = verts[faces[:, 0]], verts[faces[:, 1]], verts[faces[:, 2]]
        n = np.cross(b - a, c - a)
        if orient == 'out':                       # normals point away from the part's centre
            ref = (a + b + c) / 3 - verts.mean(0)
        elif orient == 'up':
            ref = np.tile([0.0, 1.0, 0.0], (len(faces), 1))
        else:
            ref = n
        flip = (n * ref).sum(1) < 0
        faces = faces.copy(); faces[flip] = faces[flip][:, [0, 2, 1]]
        self.V.append(verts); self.F.append(faces + self.n); self.n += len(verts)
        m = len(faces)
        self.A.append(np.broadcast_to(np.asarray(alb, float), (m, 3)).copy())
        self.E.append(np.broadcast_to(np.asarray(emis, float), (m,)).copy())
        self.M.append(np.broadcast_to(np.asarray(mat, int), (m,)).copy())

    def build(self):
        V = np.concatenate(self.V); F = np.concatenate(self.F)
        A = np.concatenate(self.A); E = np.concatenate(self.E); M = np.concatenate(self.M)
        a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
        N = norm(np.cross(b - a, c - a))
        return dict(V=V, F=F, A=A, E=E, M=M, N=N, C=(a + b + c) / 3)

# ---------- primitives (return verts, faces) ----------
BOX_F = [[0,1,2],[0,2,3],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]]

def limb(A, B, w, d, side=(1, 0, 0), taper=1.0):
    """Box running from point A to point B. w along `side`, d across. Far end scaled by taper."""
    A = np.asarray(A, float); B = np.asarray(B, float)
    ax = norm(B - A); s = np.asarray(side, float)
    s = norm(s - ax * np.dot(s, ax))
    if not np.isfinite(s).all() or np.linalg.norm(s) < 1e-6:
        s = norm(np.cross(ax, [0, 0, 1.0]))
    t = np.cross(ax, s)
    v = []
    for P, k in ((A, 1.0), (B, taper)):
        for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            v.append(P + s * sx * w * 0.5 * k + t * sz * d * 0.5 * k)
    return np.array(v), np.array(BOX_F)

def box(c, size, yaw=0.0, taper=1.0):
    """Upright box centred at c, size (sx, sy, sz), rotated about y."""
    c = np.asarray(c, float); sx, sy, sz = size
    ca, sa = math.cos(yaw), math.sin(yaw)
    side = (ca, 0, -sa)
    A = c - np.array([0, sy / 2, 0]); B = c + np.array([0, sy / 2, 0])
    return limb(A, B, sx, sz, side=side, taper=taper)

def cone(base, r, h, sides=6, rot=0.0, lean=(0, 0)):
    base = np.asarray(base, float)
    ang = rot + np.arange(sides) * 2 * math.pi / sides
    ring = base + np.stack([np.cos(ang) * r, np.zeros(sides), np.sin(ang) * r], 1)
    apex = base + np.array([lean[0], h, lean[1]])
    V = np.vstack([ring, apex, base])
    F = [[i, (i + 1) % sides, sides] for i in range(sides)] + [[i, (i + 1) % sides, sides + 1] for i in range(sides)]
    return V, np.array(F)

def gable(c, length, width, height, yaw=0.0):
    """Triangular prism (roof / tent). c = centre of the base rectangle; ridge runs along `length`."""
    c = np.asarray(c, float); ca, sa = math.cos(yaw), math.sin(yaw)
    L = np.array([ca, 0, sa]) * length / 2; Wd = np.array([-sa, 0, ca]) * width / 2
    up = np.array([0, height, 0])
    V = np.array([c - L - Wd, c + L - Wd, c + L + Wd, c - L + Wd, c - L + up, c + L + up])
    F = [[0, 1, 5], [0, 5, 4], [3, 2, 5], [3, 5, 4], [0, 3, 4], [1, 2, 5], [0, 1, 2], [0, 2, 3]]
    return V, np.array(F)

def blob(c, r, rng, rings=3, seg=6, squash=(1, 1, 1), jit=0.22):
    """Low-poly jittered sphere (boulders, heads)."""
    c = np.asarray(c, float); V = [c + np.array([0, r * squash[1], 0])]
    for i in range(1, rings):
        phi = math.pi * i / rings
        for j in range(seg):
            th = 2 * math.pi * (j + 0.5 * (i % 2)) / seg
            p = np.array([math.sin(phi) * math.cos(th) * squash[0], math.cos(phi) * squash[1], math.sin(phi) * math.sin(th) * squash[2]])
            V.append(c + p * r * (1 + rng.uniform(-jit, jit)))
    V.append(c - np.array([0, r * squash[1], 0])); V = np.array(V); F = []
    for j in range(seg):
        F.append([0, 1 + j, 1 + (j + 1) % seg])
    for i in range(rings - 2):
        a0 = 1 + i * seg; b0 = a0 + seg
        for j in range(seg):
            F.append([a0 + j, a0 + (j + 1) % seg, b0 + j]); F.append([a0 + (j + 1) % seg, b0 + (j + 1) % seg, b0 + j])
    last = 1 + (rings - 2) * seg; bot = len(V) - 1
    for j in range(seg):
        F.append([last + j, last + (j + 1) % seg, bot])
    return V, np.array(F)

# ---------- camera ----------
class Camera:
    def __init__(self, eye, target, fovy_deg, W, H, up=(0, 1, 0)):
        self.eye = np.asarray(eye, float); self.W = W; self.H = H
        self.f = norm(np.asarray(target, float) - self.eye)
        self.r = norm(np.cross(up, self.f)); self.u = np.cross(self.f, self.r)
        self.fl = (H / 2) / math.tan(math.radians(fovy_deg) / 2)
        self.cx = W / 2; self.cy = H / 2      # principal point (move it for a lens shift)

    def view(self, P):
        d = P - self.eye
        return np.stack([d @ self.r, d @ self.u, d @ self.f], 1)

    def screen(self, Vv):
        z = Vv[:, 2]
        return self.cx + Vv[:, 0] / z * self.fl, self.cy - Vv[:, 1] / z * self.fl

    def project_point(self, p):
        v = self.view(np.asarray(p, float).reshape(1, 3)); sx, sy = self.screen(v)
        return float(sx[0]), float(sy[0]), float(v[0, 2])

    def rays(self):
        """Per-pixel ray directions scaled so view depth = 1."""
        xs = (np.arange(self.W) + 0.5 - self.W / 2) / self.fl
        ys = (self.H / 2 - (np.arange(self.H) + 0.5)) / self.fl
        return self.f[None, None, :] + self.r[None, None, :] * xs[None, :, None] + self.u[None, None, :] * ys[:, None, None]

class OrthoCam:
    """Orthographic light camera for shadow maps."""
    def __init__(self, ldir, center, radius, res):
        self.f = -norm(ldir)                       # looks from the light toward the scene
        up = np.array([0, 1.0, 0]) if abs(self.f[1]) < 0.95 else np.array([1.0, 0, 0])
        self.r = norm(np.cross(up, self.f)); self.u = np.cross(self.f, self.r)
        self.c = np.asarray(center, float); self.rad = radius; self.res = res

    def project(self, P):
        d = P - self.c
        sx = (d @ self.r / self.rad * 0.5 + 0.5) * self.res
        sy = (0.5 - d @ self.u / self.rad * 0.5) * self.res
        return sx, sy, d @ self.f                  # third value: distance along the light ray

# ---------- rasterizer ----------
def clip_near(Vv, F, near=0.02):
    """Clip triangles against the near plane. Returns new verts, faces and source-face index."""
    zf = Vv[:, 2][F]; inside = zf > near; cnt = inside.sum(1)
    keep = cnt == 3
    Fk = [F[keep]]; src = [np.nonzero(keep)[0]]
    part = np.nonzero((cnt > 0) & (cnt < 3))[0]
    newV = []; newF = []; newS = []; base = len(Vv)
    for fi in part:
        pts = Vv[F[fi]]; ins = inside[fi]; poly = []
        for k in range(3):
            a = pts[k]; b = pts[(k + 1) % 3]
            if ins[k]: poly.append(a)
            if ins[k] != ins[(k + 1) % 3]:
                t = (near - a[2]) / (b[2] - a[2]); poly.append(a + (b - a) * t)
        for k in range(1, len(poly) - 1):
            newV += [poly[0], poly[k], poly[k + 1]]; newF.append([base, base + 1, base + 2]); base += 3; newS.append(fi)
    if newV:
        Vv = np.vstack([Vv, np.array(newV)]); Fk.append(np.array(newF)); src.append(np.array(newS))
    return Vv, np.concatenate(Fk), np.concatenate(src)

def rasterize(sx, sy, key, F, src, W, H):
    """Z-buffered triangle fill. key: larger = nearer. Returns face-id buffer and key buffer."""
    idb = np.full((H, W), -1, np.int32); zb = np.full((H, W), -np.inf, np.float32)
    ax, ay, ak = sx[F[:, 0]], sy[F[:, 0]], key[F[:, 0]]
    bx, by, bk = sx[F[:, 1]], sy[F[:, 1]], key[F[:, 1]]
    cx, cy, ck = sx[F[:, 2]], sy[F[:, 2]], key[F[:, 2]]
    x0 = np.clip(np.floor(np.minimum(np.minimum(ax, bx), cx)), 0, W).astype(int)
    x1 = np.clip(np.ceil(np.maximum(np.maximum(ax, bx), cx)) + 1, 0, W).astype(int)
    y0 = np.clip(np.floor(np.minimum(np.minimum(ay, by), cy)), 0, H).astype(int)
    y1 = np.clip(np.ceil(np.maximum(np.maximum(ay, by), cy)) + 1, 0, H).astype(int)
    area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
    ok = np.nonzero((x1 > x0) & (y1 > y0) & (np.abs(area) > 1e-10))[0]
    L = [a.tolist() for a in (ax, ay, ak, bx, by, bk, cx, cy, ck, x0, x1, y0, y1, area, src)]
    ax, ay, ak, bx, by, bk, cx, cy, ck, x0, x1, y0, y1, area, src = L
    xs = np.arange(W, dtype=np.float32) + 0.5; ys = (np.arange(H, dtype=np.float32) + 0.5)[:, None]
    for i in ok.tolist():
        X0, X1, Y0, Y1 = x0[i], x1[i], y0[i], y1[i]
        px = xs[X0:X1]; py = ys[Y0:Y1]
        inv = 1.0 / area[i]
        w0 = ((cx[i] - bx[i]) * (py - by[i]) - (cy[i] - by[i]) * (px - bx[i])) * inv
        w1 = ((ax[i] - cx[i]) * (py - cy[i]) - (ay[i] - cy[i]) * (px - cx[i])) * inv
        w2 = 1.0 - w0 - w1
        k = w0 * ak[i] + w1 * bk[i] + w2 * ck[i]
        zs = zb[Y0:Y1, X0:X1]
        m = (w0 >= 0) & (w1 >= 0) & (w2 >= 0) & (k > zs)
        if m.any():
            zs[m] = k[m]; idb[Y0:Y1, X0:X1][m] = src[i]
    return idb, zb

def render_ids(scene, cam, mirror=False, face_mask=None):
    """Rasterize the scene from a perspective camera. mirror=True flips the world about y=0 (lake reflection)."""
    V = scene['V'].copy(); F = scene['F']
    ids = np.arange(len(F))
    if face_mask is not None:
        F = F[face_mask]; ids = ids[face_mask]
    if mirror:
        V[:, 1] *= -1
    Vv = cam.view(V)
    Vv, Fc, src = clip_near(Vv, F)
    Vs = Vv.copy(); Vs[:, 2] = np.maximum(Vs[:, 2], 1e-6)   # unused verts behind the camera stay finite
    sx, sy = cam.screen(Vs)
    key = 1.0 / Vs[:, 2]
    idb, zb = rasterize(sx, sy, key, Fc, ids[src], cam.W, cam.H)
    depth = np.where(idb >= 0, 1.0 / np.maximum(zb, 1e-9), 1e9).astype(np.float32)
    return idb, depth

def shadow_map(scene, ldir, center, radius, res, face_mask=None):
    oc = OrthoCam(ldir, center, radius, res)
    F = scene['F'] if face_mask is None else scene['F'][face_mask]
    sx, sy, dist = oc.project(scene['V'])
    idb, zb = rasterize(sx, sy, -dist, F, np.arange(len(F)), res, res)
    return oc, zb

def shadow_lookup(oc, zb, P, bias=0.012, taps=2):
    """Soft shadow factor (1 = lit) for world points P (...,3)."""
    shp = P.shape[:-1]; Pf = P.reshape(-1, 3)
    sx, sy, dist = oc.project(Pf)
    lit = np.zeros(len(Pf), np.float32); n = 0
    for dx in range(-taps, taps + 1):
        for dy in range(-taps, taps + 1):
            ix = np.clip((sx + dx * 0.9).astype(int), 0, oc.res - 1); iy = np.clip((sy + dy * 0.9).astype(int), 0, oc.res - 1)
            lit += (-(dist - bias) >= zb[iy, ix]).astype(np.float32); n += 1
    inb = (sx >= 0) & (sx < oc.res) & (sy >= 0) & (sy < oc.res)
    return np.where(inb, lit / n, 1.0).reshape(shp), inb.reshape(shp)

def tonemap(hdr, exposure=1.0):
    x = np.maximum(hdr * exposure, 0)
    y = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)
    return np.clip(y, 0, 1) ** (1 / 2.2)

def bloom(hdr, thresh=1.0, strength=0.5, sizes=(9, 25, 61)):
    lum = hdr.max(2, keepdims=True)
    bright = hdr * np.clip((lum - thresh) / (lum + 1e-6), 0, 1)
    out = hdr.copy()
    for s in sizes:
        k = int(s) | 1
        out += cv2.GaussianBlur(bright, (k, k), 0) * (strength / len(sizes))
    return out
