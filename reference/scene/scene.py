"""Builds the lake diorama: polar-grid terrain, trees, the seven stops, wildlife and the hiker."""
import numpy as np, math
from scipy.interpolate import LinearNDInterpolator
from core import *

D2R = math.pi / 180
TV = -68 * D2R            # angle of the outlet creek (gap in the mountain ring)
NA = 240                  # angular segments
TS = [0.0, 0.34, 0.60, 0.80, 0.93, 1.0, 1.03, 1.065, 1.105, 1.14, 1.20, 1.28, 1.37, 1.47, 1.58,
      1.70, 1.83, 1.96, 2.09, 2.22, 2.36, 2.50, 2.64, 2.76, 2.86]
T_TRAIL = 1.085

# the stops around the shore, in walking order (counter-clockwise from the south)
STOPS = [('about', -90), ('work', -30), ('skills', 25), ('apps', 80), ('saas', 135), ('photo', 190), ('contact', 240)]

# palette (linear-ish albedo)
C_SNOW = (0.95, 0.95, 0.97); C_SAND = (0.84, 0.78, 0.66); C_TRAIL = (0.78, 0.64, 0.48)
C_WOOD = (0.50, 0.33, 0.24); C_WOOD_D = (0.34, 0.22, 0.17); C_CORAL = (0.90, 0.33, 0.24)
C_GOLD = (0.95, 0.68, 0.22); C_CREAM = (0.93, 0.87, 0.74); C_TEAL = (0.10, 0.36, 0.40)
C_ROCK = (0.47, 0.42, 0.47)

def angdiff(a, b):
    return (a - b + np.pi) % (2 * np.pi) - np.pi

def lake_r(th):
    return 1.0 + 0.10 * np.sin(2 * th + 0.6) + 0.06 * np.sin(3 * th + 2.1) + 0.035 * np.sin(5 * th + 4.0)

def radius(t, th):
    w = smooth(1.25, 2.3, t)
    return t * (lake_r(th) * (1 - w) + 1.0 * w)

# (angle deg, height, width deg): tall peaks to the north, low hills to the south
PEAKS = [(84, 1.18, 16), (57, 0.95, 13), (33, 0.80, 12), (112, 1.04, 14), (137, 0.80, 12), (160, 0.88, 13),
         (10, 0.72, 13), (188, 0.74, 14), (-14, 0.50, 13), (212, 0.52, 13), (236, 0.22, 14), (-38, 0.30, 12)]

def massif(th):
    m = 0.10
    for deg, h, w in PEAKS:
        m = m + h * np.exp(-(angdiff(th, deg * D2R) / (w * D2R)) ** 2)
    m = m * (0.86 + 0.28 * vnoise(th * 7.0, th * 0 + 3.3, 5))
    return m * (1 - 0.93 * np.exp(-(angdiff(th, TV) / (12 * D2R)) ** 2))

def terrain_y(t, th, x, z):
    y = smooth(1.0, 1.065, t) * 0.012 + smooth(1.105, 1.7, t) * 0.08
    y = y + 0.06 * (fbm(x * 3.1, z * 3.1, 3, 11) - 0.5) * smooth(1.16, 1.45, t)
    tp = 1.90 + 0.12 * (vnoise(th * 4.0, th * 0 + 1.7, 9) - 0.5)
    up = smooth(1.30, tp, t) ** 1.2
    down = 1 - 0.60 * smooth(tp, 2.45, t)
    rid = 1 - np.abs(2 * fbm(x * 1.7 + 5.2, z * 1.7 - 3.1, 4, 23) - 1)
    y = y + massif(th) * up * down * (0.74 + 0.5 * rid)
    return np.where(t <= 1.0, 0.0, y)

RIM = 2.45                # outer edge of the diorama (ring parameter)

def inv_radius(r, th):
    """Ring parameter t for a world radius r at angle th (inverse of radius())."""
    t = r / lake_r(th)
    for _ in range(8):
        w = smooth(1.25, 2.3, t); t = r / (lake_r(th) * (1 - w) + w)
    return t

class World:
    """Holds the mesh being built plus helpers to place things on the ground."""
    def __init__(self, seed=7, skirt=True):
        self.m = Mesh(); self.rng = np.random.default_rng(seed)
        self.lights = []          # (pos, colour, strength, radius) warm point lights for night
        self.stop_pos = {}; self.prop_pos = {}
        self._terrain(skirt)

    # ----- terrain -----
    def _terrain(self, skirt):
        from scipy.spatial import Delaunay
        rng = self.rng; dth = 2 * np.pi / NA
        # 1) lake, shore and trail: a tidy polar grid so the shoreline and path are clean ribbons
        TI = TS[:10]; nr = len(TI)
        T = np.repeat(np.array(TI)[:, None], NA, 1); TH = np.repeat((np.arange(NA) * dth - np.pi)[None, :], nr, 0)
        R = radius(T, TH); X = R * np.cos(TH); Z = R * np.sin(TH)
        Y = terrain_y(T, TH, X, Z); Y[:6] = 0.0
        creek_g = (np.abs(angdiff(TH, TV)) < 1.2 * dth) & (T > 1.0); Y[creek_g] = 0.003
        Vg = np.stack([X, Y, Z], 2).reshape(-1, 3)
        jj = np.arange(NA); jn = (jj + 1) % NA; F = []; ring = []
        for i in range(nr - 1):
            a = i * NA + jj; b = i * NA + jn; c = (i + 1) * NA + jj; d = (i + 1) * NA + jn
            alt = ((i + jj) % 2 == 0)[:, None]
            F += [np.where(alt, np.stack([a, b, c], 1), np.stack([a, b, d], 1)), np.where(alt, np.stack([b, d, c], 1), np.stack([a, d, c], 1))]
            ring += [np.full(NA, i), np.full(NA, i)]
        Fg = np.concatenate(F); ring = np.concatenate(ring)
        # 2) land: scattered points, sparse on the peaks for big chunky facets, joined by Delaunay
        pts_t = []; pts_th = []
        cand_t = rng.uniform(1.16, RIM - 0.05, 60000); cand_th = rng.uniform(-np.pi, np.pi, 60000)
        cr = radius(cand_t, cand_th); cx = cr * np.cos(cand_th); cz = cr * np.sin(cand_th)
        sp = lerp(0.042, 0.135, smooth(1.2, 1.85, cand_t))
        ax = list(Vg[9 * NA:, 0]); az = list(Vg[9 * NA:, 2]); asp = [0.03] * NA
        AX = np.array(ax); AZ = np.array(az); AS = np.array(asp)
        far_creek = np.abs(angdiff(cand_th, TV)) * cr > 0.05
        for k in range(len(cand_t)):
            if not far_creek[k]: continue
            d2 = (AX - cx[k]) ** 2 + (AZ - cz[k]) ** 2
            if (d2 < (0.5 * (AS + sp[k])) ** 2).any(): continue
            AX = np.append(AX, cx[k]); AZ = np.append(AZ, cz[k]); AS = np.append(AS, sp[k])
            pts_t.append(cand_t[k]); pts_th.append(cand_th[k])
        # creek banks (two rows) and the rim ring
        ct = np.arange(1.19, RIM - 0.02, 0.05); creek_n = len(ct) * 2
        for s_ in (-1, 1):
            for t_ in ct:
                pts_t.append(t_); pts_th.append(TV + s_ * 0.026 / radius(t_, TV))
        nrim = 110; rim_th = np.arange(nrim) * 2 * np.pi / nrim - np.pi
        rim_th = rim_th[np.abs(angdiff(rim_th, TV)) > 0.02]
        rim_th = np.sort(np.r_[rim_th, TV - 0.026 / RIM, TV + 0.026 / RIM]); nrim = len(rim_th)
        n_rand = len(pts_t) - creek_n
        lt = np.r_[np.full(NA, TI[-1]), pts_t, np.full(nrim, RIM)]; lth = np.r_[TH[-1], pts_th, rim_th]
        lr = radius(lt, lth); lx = lr * np.cos(lth); lz = lr * np.sin(lth)
        ly = terrain_y(lt, lth, lx, lz)
        jit = rng.uniform(-1, 1, len(lt)) * 0.05 * smooth(1.45, 1.8, lt) * np.minimum(massif(lth), 1.0)
        jit[-nrim:] = 0; ly = ly + jit
        is_creek = np.zeros(len(lt), bool); is_creek[NA + n_rand:NA + n_rand + creek_n] = True
        is_creek[-nrim:] = np.abs(angdiff(rim_th, TV)) < 0.03 / RIM * 1.2
        is_creek[:NA] = np.abs(angdiff(TH[-1], TV)) < 1.2 * dth
        ly[is_creek] = 0.003
        Vl = np.stack([lx, ly, lz], 1)
        tri = Delaunay(Vl[:, [0, 2]]).simplices
        cen = Vl[tri].mean(1); ctc = inv_radius(np.hypot(cen[:, 0], cen[:, 2]), np.arctan2(cen[:, 2], cen[:, 0]))
        tri = tri[ctc > TI[-1] + 0.002]
        # colours
        V = np.vstack([Vg, Vl]); Fl = tri + len(Vg)
        F = np.vstack([Fg, Fl]); ring = np.r_[ring, np.full(len(Fl), 99)]
        pa, pb, pc = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
        cen = (pa + pb + pc) / 3
        n = np.cross(pb - pa, pc - pa); n = n / (np.linalg.norm(n, axis=1, keepdims=True) + 1e-12)
        ny = np.abs(n[:, 1]); cy = cen[:, 1]
        nz = fbm(cen[:, 0] * 2.3, cen[:, 2] * 2.3, 3, 41); nz2 = vnoise(cen[:, 0] * 6.1, cen[:, 2] * 6.1, 77)
        col = np.zeros((len(F), 3)); mat = np.zeros(len(F), int)
        g1 = np.array([0.30, 0.46, 0.33]); g2 = np.array([0.55, 0.57, 0.31]); g3 = np.array([0.72, 0.50, 0.38])
        meadow = np.where((nz2 > 0.62)[:, None], g3, np.where((nz > 0.5)[:, None], g2, g1))
        rock = np.where((nz2 > 0.5)[:, None], np.array([0.58, 0.45, 0.42]), np.array(C_ROCK))
        snowline = 0.25 + 0.12 * nz
        col[:] = meadow
        steep = ny < 0.76
        col[steep] = rock[steep]
        snow = (cy > snowline) & ((ny > 0.50) | ((ny > 0.24) & (nz2 < 0.76)))
        col[snow] = C_SNOW; mat[snow] = 2
        dark = (cy > snowline) & ~snow
        col[dark] = np.where((nz2[dark] > 0.5)[:, None], np.array([0.40, 0.34, 0.40]), np.array([0.50, 0.40, 0.42]))
        patch = (cy > snowline - 0.10) & (cy <= snowline) & (ny > 0.83) & (nz2 > 0.45)
        col[patch] = C_SNOW; mat[patch] = 2
        col[ring == 8] = g1 * 1.08
        col[ring == 7] = C_TRAIL
        col[(ring == 5) | (ring == 6)] = C_SAND
        water = ring < 5
        col[water] = (0.12, 0.62, 0.64); mat[water] = 1
        vcreek = np.r_[creek_g.reshape(-1), is_creek]
        ck = vcreek[F].all(1) & (ring >= 5)
        col[ck] = (0.30, 0.80, 0.78); mat[ck] = 3
        col *= (1 + rng.uniform(-0.06, 0.06, (len(F), 1)))
        self.m.add(V, F, col, mat=mat, orient='up')
        keep = np.r_[0, np.arange(NA, len(V))]
        self._G = LinearNDInterpolator(V[keep][:, [0, 2]], V[keep][:, 1], fill_value=0.0)
        if skirt:
            self._skirt(Vl[-nrim:], rng)

    def _skirt(self, rim, rng):
        """Cut sides and tapered rock underside so the world reads as a floating diorama."""
        m = self.m; n = len(rim); base_y = -0.16
        rows = 3; rings = [rim]
        for k in range(1, rows + 1):
            r = rim.copy(); r[:, 1] = rim[:, 1] * (1 - k / rows) + base_y * (k / rows); rings.append(r)
        strata = [(0.55, 0.38, 0.36), (0.44, 0.31, 0.34), (0.33, 0.24, 0.29)]
        jj = np.arange(n); jn = (jj + 1) % n
        for k in range(rows):
            V = np.vstack([rings[k], rings[k + 1]])
            F = np.vstack([np.stack([jj, jn, n + jj], 1), np.stack([jn, n + jn, n + jj], 1)])
            c = np.array(strata[k]) * (1 + rng.uniform(-0.07, 0.07, (len(F), 1)))
            self._add_radial(V, F, c)
        # chunky underside
        seg = 40; lv = [(1.0, base_y), (0.97, -0.55), (0.88, -1.05), (0.72, -1.55), (0.50, -2.0), (0.24, -2.38)]
        ang = np.arange(seg) * 2 * np.pi / seg
        prev = None; cols = [(0.40, 0.28, 0.31), (0.50, 0.34, 0.33), (0.36, 0.26, 0.30), (0.45, 0.31, 0.32), (0.30, 0.22, 0.27)]
        for li, (s, y) in enumerate(lv):
            rr = RIM * s * (1 + rng.uniform(-0.06, 0.06, seg) * (li > 0))
            yy = y + rng.uniform(-0.09, 0.09, seg) * (li > 0)
            ringv = np.stack([rr * np.cos(ang + 0.07 * li), yy, rr * np.sin(ang + 0.07 * li)], 1)
            if prev is not None:
                V = np.vstack([prev, ringv]); j = np.arange(seg); jn2 = (j + 1) % seg
                F = np.vstack([np.stack([j, jn2, seg + j], 1), np.stack([jn2, seg + jn2, seg + j], 1)])
                c = np.array(cols[li - 1]) * (1 + rng.uniform(-0.09, 0.09, (len(F), 1)))
                self._add_radial(V, F, c)
            prev = ringv
        apex = np.array([[0.05, -2.62, -0.03]]); V = np.vstack([prev, apex]); j = np.arange(seg)
        self._add_radial(V, np.stack([j, (j + 1) % seg, np.full(seg, seg)], 1), (0.27, 0.20, 0.25))
        # waterfall spilling off the rim where the creek leaves
        r0 = RIM; w = 0.055; tang = np.array([-math.sin(TV), 0, math.cos(TV)]); out = np.array([math.cos(TV), 0, math.sin(TV)])
        p = out * (r0 + 0.004); ys = [0.004, -0.3, -0.75, -1.3, -1.9]
        V = []
        for k, y in enumerate(ys):
            wk = w * (1 + 0.3 * k); o = out * 0.025 * k
            V += [p + o - tang * wk / 2 + [0, y, 0], p + o + tang * wk / 2 + [0, y, 0]]
        V = np.array(V); F = []; cs = []
        for k in range(len(ys) - 1):
            F += [[2 * k, 2 * k + 1, 2 * k + 2], [2 * k + 1, 2 * k + 3, 2 * k + 2]]
            cc = lerp(np.array([0.50, 0.90, 0.88]), np.array([0.97, 0.99, 1.0]), k / 3); cs += [cc, cc]
        m.add(V, F, np.array(cs), emis=0.25, mat=3, orient='none')

    def _add_radial(self, V, F, col):
        """Add faces with normals pointing away from the vertical axis (and not upward-inward)."""
        V = np.asarray(V); F = np.asarray(F)
        a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
        n = np.cross(b - a, c - a); cen = (a + b + c) / 3; ref = cen * [1, 0, 1] + [0, -0.3, 0]
        flip = (n * ref).sum(1) < 0
        F = F.copy(); F[flip] = F[flip][:, [0, 2, 1]]
        self.m.add(V, F, col, mat=5, orient='none')

    # ----- placement helpers -----
    def ground(self, x, z):
        return float(self._G(x, z))

    def at(self, deg, t):
        """World position on the ground at lake angle `deg` and ring parameter t."""
        th = deg * D2R; r = float(radius(t, th)); x = r * math.cos(th); z = r * math.sin(th)
        return np.array([x, self.ground(x, z) if t > 1.0 else 0.0, z])

    def frame(self, deg):
        th = deg * D2R
        return np.array([math.cos(th), 0, math.sin(th)]), np.array([-math.sin(th), 0, math.cos(th)])  # outward, tangent (ccw)

    def add(self, vf, col, **kw):
        self.m.add(vf[0], vf[1], col, **kw)

    # ----- vegetation -----
    def trees(self, count=1150, clear=()):
        rng = self.rng; n = count * 30
        t = rng.uniform(1.15, 1.9, n); th = rng.uniform(-np.pi, np.pi, n)
        r = radius(t, th); x = r * np.cos(th); z = r * np.sin(th); y = self._G(x, z)
        ok = np.abs(angdiff(th, TV)) > 4.2 * D2R                      # keep the creek clear
        ok &= y < 0.36 + 0.1 * rng.random(n)                          # tree line
        ok &= fbm(x * 2.4, z * 2.4, 3, 91) > 0.40 + 0.25 * smooth(1.45, 1.85, t)   # clumps, thinning uphill
        e = 0.03; g = np.stack([self._G(x + e, z), self._G(x - e, z), self._G(x, z + e), self._G(x, z - e)])
        ok &= (g.max(0) - g.min(0)) < 0.075                           # no trees on cliffs
        for s_ in [self.at(d, 1.2) for _, d in STOPS] + list(clear):
            ok &= np.hypot(x - s_[0], z - s_[2]) > 0.13               # clearings around stops
        idx = np.nonzero(ok)[0][:count]
        for i in idx:
            h = rng.uniform(0.085, 0.16) * (1.15 if t[i] > 1.3 else 0.95)
            self.tree(np.array([x[i], y[i] - 0.006, z[i]]), h, larch=rng.random() < 0.13)
        return len(idx)

    def tree(self, p, h, larch=False):
        rng = self.rng; r = h * rng.uniform(0.22, 0.29); rot = rng.uniform(0, 6.28)
        if larch:
            base = np.array(C_GOLD) * rng.uniform(0.85, 1.05)
        else:
            base = np.array([(0.10, 0.27, 0.25), (0.13, 0.32, 0.26), (0.09, 0.23, 0.24)][rng.integers(3)]) * rng.uniform(0.85, 1.15)
        self.add(limb(p, p + [0, h * 0.2, 0], h * 0.05, h * 0.05), C_WOOD_D)
        for k, (y0, rr, y1) in enumerate([(0.12, 1.0, 0.56), (0.36, 0.76, 0.80), (0.60, 0.52, 1.0)]):
            V, F = cone(p + [0, h * y0, 0], r * rr, h * (y1 - y0), 6, rot + k * 0.5)
            self.add((V, F), base * (1 + 0.10 * k))

    def boulders(self, n=70):
        rng = self.rng
        for _ in range(n):
            deg = rng.uniform(-180, 180)
            if abs(angdiff(deg * D2R, TV)) < 3 * D2R: continue
            t = rng.choice([rng.uniform(0.985, 1.06), rng.uniform(1.12, 1.5)])
            if 1.06 < t < 1.115: continue
            p = self.at(deg, t); r = rng.uniform(0.008, 0.028)
            self.add(blob(p + [0, r * 0.3, 0], r, rng, squash=(1, 0.7, 1)), np.array(C_ROCK) * rng.uniform(0.8, 1.15))

    # ----- characters -----
    class Fr:
        """Local frame: x = right, y = up, z = forward."""
        def __init__(self, pos, heading):
            self.p = np.asarray(pos, float)
            self.fwd = np.array([math.cos(heading), 0, math.sin(heading)])
            self.right = np.array([math.sin(heading), 0, -math.cos(heading)])
        def P(self, x, y, z):
            return self.p + self.right * x + np.array([0, y, 0]) + self.fwd * z

    def hiker(self, pos, heading, H=0.05, stride=1.0):
        fr = World.Fr(pos, heading); P = fr.P; R = fr.right; rng = self.rng
        pants = (0.17, 0.19, 0.25); boots = (0.24, 0.16, 0.12); jacket = (0.10, 0.30, 0.36); skin = (0.60, 0.42, 0.31)
        s = stride
        # legs (left forward) + boots
        self.add(limb(P(-0.07 * H, 0.50 * H, 0), P(-0.07 * H, 0.05 * H, 0.15 * H * s), 0.11 * H, 0.12 * H, R, 0.8), pants)
        self.add(limb(P(0.07 * H, 0.50 * H, 0), P(0.07 * H, 0.07 * H, -0.14 * H * s), 0.11 * H, 0.12 * H, R, 0.8), pants)
        self.add(limb(P(-0.07 * H, 0.0, 0.11 * H * s), P(-0.07 * H, 0.07 * H, 0.17 * H * s), 0.11 * H, 0.2 * H, R), boots)
        self.add(limb(P(0.07 * H, 0.02 * H, -0.18 * H * s), P(0.07 * H, 0.09 * H, -0.12 * H * s), 0.11 * H, 0.2 * H, R), boots)
        # torso, arms
        self.add(limb(P(0, 0.46 * H, 0), P(0, 0.81 * H, 0.01 * H), 0.24 * H, 0.15 * H, R, 1.18), jacket)
        self.add(limb(P(-0.165 * H, 0.79 * H, 0), P(-0.19 * H, 0.50 * H, -0.07 * H * s), 0.08 * H, 0.085 * H, R, 0.85), jacket)
        self.add(limb(P(0.165 * H, 0.79 * H, 0), P(0.19 * H, 0.52 * H, 0.11 * H * s), 0.08 * H, 0.085 * H, R, 0.85), jacket)
        # trekking poles
        self.add(limb(P(-0.19 * H, 0.50 * H, -0.07 * H), P(-0.25 * H, 0.0, -0.24 * H), 0.016 * H, 0.016 * H, R), (0.78, 0.78, 0.82))
        self.add(limb(P(0.19 * H, 0.52 * H, 0.11 * H), P(0.25 * H, 0.0, 0.30 * H), 0.016 * H, 0.016 * H, R), (0.78, 0.78, 0.82))
        # backpack with bedroll
        self.add(limb(P(0, 0.47 * H, -0.135 * H), P(0, 0.83 * H, -0.125 * H), 0.25 * H, 0.14 * H, R, 0.92), C_CORAL)
        self.add(limb(P(0, 0.50 * H, -0.215 * H), P(0, 0.66 * H, -0.21 * H), 0.16 * H, 0.04 * H, R, 0.95), np.array(C_CORAL) * 0.8)
        self.add(limb(P(-0.15 * H, 0.87 * H, -0.12 * H), P(0.15 * H, 0.87 * H, -0.12 * H), 0.08 * H, 0.08 * H, (0, 1, 0)), C_CREAM)
        # head, toque, pom-pom
        self.add(blob(P(0, 0.905 * H, 0.012 * H), 0.082 * H, rng, jit=0.04), skin)
        self.add(blob(P(0, 0.945 * H, 0.004 * H), 0.088 * H, rng, squash=(1, 0.75, 1), jit=0.04), C_GOLD)
        self.add(blob(P(0, 1.03 * H, 0), 0.03 * H, rng, jit=0.05), C_CREAM)

    def quadruped(self, pos, heading, kind='elk', scale=1.0):
        fr = World.Fr(pos, heading); P = fr.P; R = fr.right; H = 0.05 * scale; rng = self.rng
        if kind == 'elk':
            body = (0.60, 0.45, 0.31); dark = (0.33, 0.23, 0.18); bl, bw, bh, by, leg = 1.05, 0.30, 0.40, 0.92, 0.07
        elif kind == 'moose':
            body = (0.24, 0.18, 0.15); dark = (0.17, 0.13, 0.12); bl, bw, bh, by, leg = 1.25, 0.36, 0.52, 1.18, 0.085
        else:  # bear
            body = (0.40, 0.28, 0.19); dark = (0.30, 0.21, 0.15); bl, bw, bh, by, leg = 1.0, 0.44, 0.50, 0.62, 0.13
        bl *= H; bw *= H; bh *= H; by *= H; leg *= H
        # body (slightly tapered toward the rump) and legs
        self.add(limb(P(0, by, -bl * 0.5), P(0, by + 0.03 * H, bl * 0.5), bw, bh, R, 1.08 if kind != 'bear' else 0.95), body)
        for sx in (-1, 1):
            for sz, k in ((0.36, 0.0), (-0.38, 0.05)):
                self.add(limb(P(sx * bw * 0.33, by - bh * 0.3, bl * sz), P(sx * bw * 0.33, 0, bl * (sz + (0.05 if sx > 0 else -0.04))), leg, leg, R, 0.7), dark if kind != 'bear' else body)
        if kind == 'bear':
            self.add(limb(P(0, by + bh * 0.25, bl * 0.12), P(0, by + bh * 0.42, bl * 0.34), bw * 0.8, bh * 0.5, R, 0.8), body)       # shoulder hump
            hb = P(0, by + 0.02 * H, bl * 0.5); ht = P(0, by - 0.10 * H, bl * 0.5 + 0.34 * H)
            self.add(limb(hb, ht, 0.30 * H, 0.28 * H, R, 0.62), body)
            self.add(limb(ht, P(0, by - 0.15 * H, bl * 0.5 + 0.46 * H), 0.13 * H, 0.11 * H, R, 0.8), dark)
            for sx in (-1, 1):
                self.add(box(P(sx * 0.11 * H, by + 0.16 * H, bl * 0.5 + 0.10 * H), (0.07 * H, 0.07 * H, 0.04 * H)), dark)
            return
        # neck + head
        nb = P(0, by + bh * 0.25, bl * 0.42); nt = P(0, by + bh * (1.05 if kind == 'elk' else 0.55), bl * 0.5 + 0.22 * H)
        self.add(limb(nb, nt, bw * 0.62, bh * 0.55, R, 0.62), dark)
        hl = (0.34 if kind == 'elk' else 0.48) * H
        tip = nt + fr.fwd * hl + np.array([0, -0.12 * H if kind == 'elk' else -0.2 * H, 0])
        self.add(limb(nt + [0, 0.02 * H, 0], tip, 0.15 * H, 0.16 * H, R, 0.6), body if kind == 'elk' else dark)
        for sx in (-1, 1):
            self.add(limb(nt + R * sx * 0.07 * H + [0, 0.07 * H, 0], nt + R * sx * 0.17 * H + [0, 0.13 * H, 0] - fr.fwd * 0.03 * H, 0.03 * H, 0.05 * H, fr.fwd), dark)
        if kind == 'elk':
            self.add(box(P(0, by + 0.04 * H, -bl * 0.52), (bw * 0.7, bh * 0.5, 0.03 * H)), C_CREAM)        # rump patch
            ant = (0.86, 0.80, 0.68)
            for sx in (-1, 1):
                a0 = nt + R * sx * 0.05 * H + [0, 0.09 * H, 0]
                a1 = a0 + R * sx * 0.20 * H + np.array([0, 0.36 * H, 0]) - fr.fwd * 0.22 * H
                a2 = a1 + R * sx * 0.05 * H + np.array([0, 0.26 * H, 0]) - fr.fwd * 0.10 * H
                self.add(limb(a0, a1, 0.028 * H, 0.028 * H, fr.fwd), ant); self.add(limb(a1, a2, 0.022 * H, 0.022 * H, fr.fwd), ant)
                for f, up in ((0.35, 0.20), (0.75, 0.22)):
                    b0 = a0 + (a1 - a0) * f
                    self.add(limb(b0, b0 + fr.fwd * 0.16 * H + np.array([0, up * H, 0]) + R * sx * 0.03 * H, 0.02 * H, 0.02 * H, R), ant)
                self.add(limb(a1, a1 + fr.fwd * 0.10 * H + np.array([0, 0.20 * H, 0]), 0.02 * H, 0.02 * H, R), ant)
        else:  # moose: palmate antlers + bell
            ant = (0.70, 0.62, 0.50)
            for sx in (-1, 1):
                a0 = nt + R * sx * 0.06 * H + [0, 0.08 * H, 0]; a1 = a0 + R * sx * 0.20 * H + [0, 0.07 * H, 0]
                self.add(limb(a0, a1, 0.04 * H, 0.04 * H, fr.fwd), ant)
                self.add(limb(a1, a1 + R * sx * 0.30 * H + np.array([0, 0.20 * H, 0]), 0.30 * H, 0.03 * H, fr.fwd, 0.75), ant)
            self.add(limb(nt + [0, -0.12 * H, 0] + fr.fwd * 0.1 * H, nt + [0, -0.28 * H, 0] + fr.fwd * 0.1 * H, 0.05 * H, 0.05 * H, R, 0.5), dark)

    # ----- the seven stops -----
    def stops(self):
        rng = self.rng; m = self.m
        WIN = (1.0, 0.78, 0.42)
        for name, deg in STOPS:
            out, tan = self.frame(deg); yaw = math.atan2(tan[2], tan[0])   # heading of the tangent
            c = self.at(deg, 1.21)
            self.stop_pos[name] = self.at(deg, T_TRAIL)
            hh = {'about': (1.15, 0.10), 'work': (1.21, 0.16), 'skills': (1.23, 0.27), 'apps': (1.19, 0.085), 'saas': (0.90, 0.07), 'photo': (1.03, 0.11), 'contact': (1.17, 0.07)}[name]
            self.prop_pos[name] = self.at(deg, hh[0]) + [0, hh[1], 0]
            if name == 'about':        # trailhead kiosk
                c = self.at(deg, 1.15)
                for s in (-1, 1):
                    self.add(limb(c + tan * s * 0.045, c + tan * s * 0.045 + [0, 0.075, 0], 0.008, 0.008, tan), C_WOOD_D)
                self.add(limb(c + [0, 0.035, 0] - tan * 0.045, c + [0, 0.035, 0] + tan * 0.045, 0.045, 0.006, (0, 1, 0)), C_CREAM)
                self.add(gable(c + [0, 0.075, 0], 0.115, 0.04, 0.02, yaw), C_SNOW)
                self.lights.append((c + [0, 0.05, 0] - out * 0.02, WIN, 0.5, 0.25))
                self.add(box(c + [0, 0.062, 0] - out * 0.012, (0.012, 0.012, 0.012)), WIN, emis=6.0)
            elif name == 'work':       # ranger cabin
                self.cabin(c, yaw, out)
            elif name == 'skills':     # fire lookout tower
                self.lookout(self.at(deg, 1.23), yaw)
            elif name == 'apps':       # campsite: one tent per app
                cols = [C_CORAL, C_GOLD, C_CREAM]
                for k in range(3):
                    tc = self.at(deg + (k - 1) * 5.2, 1.19 + 0.03 * (k % 2)); ty = yaw + 1.57 + (k - 1) * 0.35
                    self.tent(tc - [0, 0.004, 0], 0.092, 0.078, 0.060, ty, np.array(cols[k]))
                    self.lights.append((tc + [0, 0.03, 0], (1.0, 0.62, 0.36), 0.55, 0.22))
            elif name == 'saas':       # dock with canoes: one canoe per product
                a = self.at(deg, 1.0); b = a - out * 0.24
                self.add(limb(a + [0, 0.012, 0] + out * 0.03, b + [0, 0.012, 0], 0.04, 0.006, tan), C_WOOD)
                self.add(limb(b + [0, 0.012, 0] - tan * 0.05, b + [0, 0.012, 0] + tan * 0.05, 0.04, 0.006, out), C_WOOD)
                for f in (0.25, 0.6, 1.0):
                    for s in (-1, 1):
                        q = a + (b - a) * f + tan * s * 0.022
                        self.add(limb(q - [0, 0.01, 0], q + [0, 0.026, 0], 0.007, 0.007, tan), C_WOOD_D)
                for k, (f, s, cc) in enumerate([(0.45, 1, C_CORAL), (0.85, 1, C_CORAL), (0.6, -1, C_GOLD)]):
                    self.canoe(a + (b - a) * f + tan * s * 0.062, yaw + 1.57 + 0.25 * s * (k - 1), cc)
                lp = b + [0, 0.05, 0]
                self.add(limb(b + tan * 0.03, b + tan * 0.03 + [0, 0.05, 0], 0.006, 0.006, tan), C_WOOD_D)
                self.add(box(b + tan * 0.03 + [0, 0.054, 0], (0.010, 0.010, 0.010)), WIN, emis=3.0)
                self.lights.append((lp, WIN, 0.5, 0.25))
            elif name == 'photo':      # rocky point with a camera tripod
                base = self.at(deg, 1.035)
                for k in range(7):
                    q = base + tan * rng.uniform(-0.05, 0.05) + out * rng.uniform(-0.07, 0.01); r = rng.uniform(0.018, 0.04)
                    self.add(blob(q + [0, r * 0.2, 0], r, rng, squash=(1.2, 0.6, 1.1)), np.array(C_ROCK) * rng.uniform(0.85, 1.1))
                tp = base - out * 0.02 + [0, 0.03, 0]; top = tp + [0, 0.05, 0]
                for k in range(3):
                    aa = k * 2.094 + 0.4
                    self.add(limb(tp + [0.016 * math.cos(aa), 0, 0.016 * math.sin(aa)], top, 0.004, 0.004, tan), (0.15, 0.15, 0.17))
                self.add(box(top + [0, 0.008, 0], (0.022, 0.015, 0.014), yaw), (0.12, 0.12, 0.14))
                self.add(limb(top + [0, 0.008, 0], top + [0, 0.008, 0] - out * 0.016, 0.009, 0.009, tan), (0.2, 0.2, 0.23))
            elif name == 'contact':    # campfire with log benches
                c = self.at(deg, 1.17)
                for k in range(7):
                    aa = k * 0.9; self.add(blob(c + [0.022 * math.cos(aa), 0.004, 0.022 * math.sin(aa)], 0.007, rng), np.array(C_ROCK) * 0.9)
                self.add(limb(c + [-0.014, 0.006, -0.006], c + [0.014, 0.012, 0.006], 0.007, 0.007, (0, 1, 0)), C_WOOD_D)
                self.add(limb(c + [-0.006, 0.006, 0.014], c + [0.006, 0.012, -0.014], 0.007, 0.007, (0, 1, 0)), C_WOOD_D)
                self.add(cone(c + [0, 0.008, 0], 0.012, 0.04, 5, 0.3), (1.0, 0.45, 0.12), emis=9.0)
                self.add(cone(c + [0.003, 0.008, 0.002], 0.007, 0.028, 4, 1.0), (1.0, 0.85, 0.35), emis=14.0)
                for s in (-1, 1):
                    bc = c + tan * s * 0.055 + out * 0.01
                    self.add(limb(bc - out * 0.03 + [0, 0.008, 0], bc + out * 0.03 + [0, 0.008, 0], 0.016, 0.014, (0, 1, 0)), C_WOOD)
                self.lights.append((c + [0, 0.03, 0], (1.0, 0.55, 0.22), 1.6, 0.45))

    def cabin(self, c, yaw, out):
        L, Wd, Hh = 0.17, 0.115, 0.075; c = c - [0, 0.005, 0]
        self.add(box(c + [0, Hh / 2, 0], (L, Hh, Wd), -yaw), C_WOOD)
        tan = np.array([math.cos(yaw), 0, math.sin(yaw)])
        self.add(gable(c + [0, Hh, 0], L * 1.12, Wd * 1.25, 0.062, yaw), C_SNOW)
        self.add(box(c + tan * 0.05 + out * 0.01 + [0, Hh + 0.05, 0], (0.02, 0.05, 0.02)), (0.42, 0.36, 0.38))
        WIN = (1.0, 0.78, 0.42); face = c - out * (Wd / 2 + 0.002)
        self.add(limb(face + [0, 0.002, 0], face + [0, 0.046, 0], 0.026, 0.004, tan), C_WOOD_D)                  # door
        for s in (-1, 1):
            self.add(limb(face + tan * s * 0.052 + [0, 0.03, 0], face + tan * s * 0.052 + [0, 0.055, 0], 0.03, 0.004, tan), WIN, emis=5.0)
        self.add(limb(face - out * 0.022 + [0, 0.004, 0] - tan * L * 0.5, face - out * 0.022 + [0, 0.004, 0] + tan * L * 0.5, 0.04, 0.008, out), C_WOOD_D)  # porch
        self.lights.append((face - out * 0.03 + [0, 0.04, 0], WIN, 0.9, 0.3))

    def lookout(self, c, yaw):
        top = 0.17; WIN = (1.0, 0.78, 0.42)
        for sx in (-1, 1):
            for sz in (-1, 1):
                self.add(limb(c + [sx * 0.045, 0, sz * 0.045], c + [sx * 0.028, top, sz * 0.028], 0.008, 0.008, (1, 0, 0)), C_WOOD_D)
        for k, (a, b) in enumerate([((-1, -1), (1, -1)), ((1, -1), (1, 1)), ((1, 1), (-1, 1)), ((-1, 1), (-1, -1))]):
            self.add(limb(c + [a[0] * 0.042, 0.03, a[1] * 0.042], c + [b[0] * 0.032, 0.125, b[1] * 0.032], 0.005, 0.005, (0, 1, 0)), C_WOOD_D)
        self.add(box(c + [0, top + 0.004, 0], (0.10, 0.008, 0.10)), C_WOOD)
        self.add(box(c + [0, top + 0.036, 0], (0.066, 0.056, 0.066)), C_WOOD)
        for a in range(4):
            d = np.array([math.cos(a * 1.5708), 0, math.sin(a * 1.5708)]); s = np.array([-d[2], 0, d[0]])
            self.add(limb(c + d * 0.0345 + [0, top + 0.026, 0], c + d * 0.0345 + [0, top + 0.052, 0], 0.042, 0.003, s), WIN, emis=5.0)
        V, F = cone(c + [0, top + 0.064, 0], 0.062, 0.04, 4, 0.785)
        self.add((V, F), C_SNOW)
        self.lights.append((c + [0, top + 0.03, 0], WIN, 0.7, 0.3))

    def tent(self, c, L, Wd, h, yaw, col):
        """Ridge tent with sloped ends: two trapezoid sides, two triangular doors."""
        f = np.array([math.cos(yaw), 0, math.sin(yaw)]); s = np.array([-f[2], 0, f[0]]); up = np.array([0, h, 0])
        V = np.array([c - f * L / 2 - s * Wd / 2, c + f * L / 2 - s * Wd / 2, c + f * L / 2 + s * Wd / 2, c - f * L / 2 + s * Wd / 2,
                      c - f * L * 0.20 + up, c + f * L * 0.20 + up])
        self.m.add(V, [[0, 1, 5], [0, 5, 4], [3, 2, 5], [3, 5, 4]], col, emis=0.7, orient='out')
        self.m.add(V, [[0, 3, 4], [1, 2, 5]], col * 0.78, emis=0.9, orient='out')

    def canoe(self, c, yaw, col):
        f = np.array([math.cos(yaw), 0, math.sin(yaw)]); s = np.array([-f[2], 0, f[0]]); L = 0.062; Wd = 0.014
        bow = c + f * L + [0, 0.018, 0]; stern = c - f * L + [0, 0.018, 0]
        l = c + s * Wd + [0, 0.012, 0]; r = c - s * Wd + [0, 0.012, 0]; keel = c + [0, -0.004, 0]
        V = np.array([bow, stern, l, r, keel])
        self.m.add(V, [[0, 2, 4], [0, 4, 3], [1, 4, 2], [1, 3, 4]], np.array(col), orient='out')
        self.m.add(V + [0, 0.0005, 0], [[0, 3, 2], [1, 2, 3]], np.array(col) * 0.55, orient='up')

    def bridge(self):
        deg = TV / D2R; out, tan = self.frame(deg); c = self.at(deg, T_TRAIL); c[1] = 0.016
        self.add(limb(c - tan * 0.05, c + tan * 0.05, 0.042, 0.007, out), C_WOOD)
        for s in (-1, 1):
            e = c + out * s * 0.021
            self.add(limb(e - tan * 0.05 + [0, 0.022, 0], e + tan * 0.05 + [0, 0.022, 0], 0.004, 0.004, out), C_WOOD_D)
            for k in (-1, 0, 1):
                self.add(limb(e + tan * k * 0.045, e + tan * k * 0.045 + [0, 0.022, 0], 0.004, 0.004, out), C_WOOD_D)

    def lanterns(self, step=15):
        """Small trail lanterns: a necklace of warm lights around the lake at night."""
        for deg in np.arange(-180, 180, step) + 7.5:
            if abs(angdiff(deg * D2R, TV)) < 4 * D2R: continue
            p = self.at(deg, 1.118)
            self.add(limb(p, p + [0, 0.022, 0], 0.004, 0.004, (1, 0, 0)), C_WOOD_D)
            self.add(box(p + [0, 0.026, 0], (0.009, 0.009, 0.009)), (1.0, 0.76, 0.40), emis=3.4)
            self.lights.append((p + [0, 0.03, 0], (1.0, 0.70, 0.38), 0.28, 0.16))

    def trail_point(self, deg, t=T_TRAIL):
        return self.at(deg, t)


def build(hiker_deg=48.0, hiker_heading_off=0.0, skirt=True, hiker_stride=1.0, hiker_t=T_TRAIL, hiker_heading=None, seed=7, hiker_y=None, hiker_shift=(0, 0, 0)):
    """Stage 1: terrain, stops, hiker and wildlife. Call finalize() after choosing the camera."""
    w = World(seed, skirt)
    w.stops(); w.bridge(); w.lanterns(); w.boulders()
    out, tan = w.frame(hiker_deg); hp = w.at(hiker_deg, hiker_t) + np.array(hiker_shift, float)
    if hiker_y is not None: hp[1] = hiker_y
    head = math.atan2(tan[2], tan[0]) + hiker_heading_off if hiker_heading is None else hiker_heading
    w.hiker(hp, head, stride=hiker_stride); w.hiker_pos = hp; w.hiker_heading = head
    def animal(deg, t, turn, kind, sc, sink=0.0):
        o, tg = w.frame(deg); p = w.at(deg, t) - [0, sink, 0]
        w.quadruped(p, math.atan2(tg[2], tg[0]) + turn, kind, sc); return p
    w.animals = [animal(5, 1.132, 2.4, 'elk', 1.05), animal(49, 1.165, 2.6, 'elk', 1.05), animal(53.5, 1.20, 1.2, 'elk', 0.9),
                 animal(214, 1.17, 3.0, 'bear', 1.1), animal(218, 1.20, 2.7, 'bear', 0.62), animal(-52, 1.17, -0.6, 'elk', 1.0)]
    animal(108, 0.955, 0.3, 'moose', 1.15, sink=0.012)      # moose wading in the shallows
    return w

def finalize(w, clear=()):
    """Stage 2: plant trees (keeping the given points clear, e.g. the camera) and bake the mesh."""
    w.trees(clear=list(w.animals) + [w.hiker_pos] + list(clear))
    sc = w.m.build(); sc['lights'] = w.lights
    return sc
