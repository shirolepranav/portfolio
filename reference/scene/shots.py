"""Shading, water, sky and the camera set-ups for each style frame.
Usage: python3 shots.py <shot> <day|night> [scale]"""
import sys, json, time, math
import numpy as np, cv2
from core import *
import scene as S

D2R = math.pi / 180
def dirv(az_deg, el_deg):
    a = az_deg * D2R; e = el_deg * D2R
    return np.array([math.cos(e) * math.cos(a), math.sin(e), math.cos(e) * math.sin(a)])
def c3(*v): return np.array(v, np.float32)

def env_day(az, el=15):
    return dict(night=False, sun=dirv(az, el).astype(np.float32), sun_light=c3(1.0, 0.78, 0.55) * 3.6,
                amb_sky=c3(0.34, 0.47, 0.70) * 0.72, amb_ground=c3(0.60, 0.42, 0.40) * 0.42,
                sky=(c3(1.0, 0.68, 0.48) * 1.15, c3(0.34, 0.62, 0.72), c3(0.09, 0.31, 0.55)), below=c3(0.84, 0.62, 0.56),
                glow=(1.4, 0.16), sun_col=c3(1.0, 0.74, 0.46), disc=c3(1.0, 0.95, 0.82) * 40, sun_r=0.030,
                fog_d=0.11, fog_h=1.2, fog_max=0.72, fog_tint=0.82, water_shallow=c3(0.20, 0.82, 0.78), water_deep=c3(0.015, 0.40, 0.52),
                water_light=1.2, refl_max=0.50, refl_tint=c3(0.62, 0.96, 0.94), spec_p=260.0, spec_s=7.0, emis=0.10, exposure=0.95)

def env_night(az, el=38):
    return dict(night=True, sun=dirv(az, el).astype(np.float32), sun_light=c3(0.42, 0.56, 0.95) * 0.62,
                amb_sky=c3(0.10, 0.17, 0.32) * 0.6, amb_ground=c3(0.05, 0.07, 0.12) * 0.4,
                sky=(c3(0.060, 0.135, 0.22), c3(0.030, 0.065, 0.14), c3(0.010, 0.020, 0.055)), below=c3(0.03, 0.06, 0.10),
                glow=(0.20, 0.05), sun_col=c3(0.6, 0.72, 1.0), disc=c3(1.0, 0.97, 0.90) * 9, sun_r=0.026,
                fog_d=0.15, fog_h=0.9, fog_max=0.85, water_shallow=c3(0.10, 0.44, 0.47), water_deep=c3(0.008, 0.10, 0.16),
                water_light=0.55, refl_max=0.86, refl_tint=c3(0.85, 1.0, 1.0), spec_p=300.0, spec_s=3.0, emis=1.0, exposure=1.35)

def sky(d, env, disc=True):
    """Sky colour for unit directions d (...,3)."""
    t = np.clip(np.arcsin(np.clip(d[..., 1], -1, 1)) / (np.pi / 2), -0.4, 1)
    hz, mid, zen = env['sky']
    c = lerp(hz, mid, smooth(0.0, 0.17, t)[..., None]); c = lerp(c, zen, smooth(0.10, 0.62, t)[..., None])
    c = lerp(c, env['below'], smooth(0.0, -0.22, t)[..., None])
    ang = np.arccos(np.clip((d * env['sun']).sum(-1), -1, 1))
    glow = env['glow'][0] * np.exp(-ang / 0.085) + env['glow'][1] * np.exp(-ang / 0.38)
    c = c + env['sun_col'] * glow[..., None]
    if disc:
        m = smooth(env['sun_r'] * 1.06, env['sun_r'] * 0.94, ang)
        if env['night']:      # crescent moon: cut a second disc out of the first
            off = norm(env['sun'] + np.array([0.012, 0.010, 0.004], np.float32)).astype(np.float32)
            a2 = np.arccos(np.clip((d * off).sum(-1), -1, 1)); m = m * (1 - smooth(env['sun_r'] * 0.98, env['sun_r'] * 0.86, a2))
        c = c + env['disc'] * m[..., None]
    return c.astype(np.float32)

MW_N = norm(np.array([0.55, 0.35, -0.75]))       # pole of the Milky Way band
def make_stars(n=5200, seed=3):
    rng = np.random.default_rng(seed)
    d = norm(rng.normal(size=(n * 3, 3))); d[:, 1] = np.abs(d[:, 1])
    band = np.exp(-((d @ MW_N) ** 2) / 0.02)
    keep = rng.random(len(d)) < (0.30 + 0.70 * band)
    d = d[keep][:n]; mag = rng.random(len(d)) ** 4.5
    tint = np.stack([1 - 0.25 * rng.random(len(d)), 0.92 + 0.08 * rng.random(len(d)), 0.85 + 0.15 * rng.random(len(d))], 1)
    return d, mag, tint
STARS = make_stars()

def star_layer(cam, mirror, ss):
    d, mag, tint = STARS
    if mirror: d = d * [1, -1, 1]
    vx = d @ cam.r; vy = d @ cam.u; vz = d @ cam.f
    ok = vz > 0.08
    sx = cam.cx + vx[ok] / vz[ok] * cam.fl; sy = cam.cy - vy[ok] / vz[ok] * cam.fl
    img = np.zeros((cam.H, cam.W, 3), np.float32)
    el = np.abs(d[ok, 1])
    for x, y, mg, tn, e in zip(sx, sy, mag[ok], tint[ok], el):
        if 0 <= x < cam.W and 0 <= y < cam.H:
            r = (0.5 + 1.5 * mg) * cam.H / 2100.0; b = (0.25 + 2.6 * mg) * min(1.0, 0.25 + e * 2.5)
            cv2.circle(img, (int(x), int(y)), max(1, int(round(r))), (float(tn[0] * b), float(tn[1] * b), float(tn[2] * b)), -1, cv2.LINE_AA)
    k = int(cam.H / 1100) * 2 + 1; k2 = int(cam.H / 260) * 2 + 1
    return cv2.GaussianBlur(img, (k, k), 0) * 1.5 + cv2.GaussianBlur(img, (k2, k2), 0) * 0.9

def shade(scene, cam, env, idb, depth, shadows, mirror=False, refl=None, stars=None, band=220):
    """Deferred shading in row bands (keeps memory small). Returns an HDR float image."""
    H, W = idb.shape; out = np.zeros((H, W, 3), np.float32)
    A = scene['A'].astype(np.float32); N = scene['N'].astype(np.float32); E = scene['E'].astype(np.float32); M = scene['M']
    L = env['sun']; eye = cam.eye.astype(np.float32)
    xs = ((np.arange(W) + 0.5 - cam.cx) / cam.fl).astype(np.float32)
    lights = scene['lights'] if env['night'] else []
    lproj = [cam.project_point(np.asarray(lp) * ([1, -1, 1] if mirror else [1, 1, 1])) for lp, _, _, _ in lights]
    for y0 in range(0, H, band):
        y1 = min(H, y0 + band)
        ys = ((cam.cy - (np.arange(y0, y1) + 0.5)) / cam.fl).astype(np.float32)
        rays = (cam.f[None, None, :] + cam.r[None, None, :] * xs[None, :, None] + cam.u[None, None, :] * ys[:, None, None]).astype(np.float32)
        ib = idb[y0:y1]; valid = ib >= 0; fid = np.where(valid, ib, 0); dp = depth[y0:y1]
        P = eye + rays * dp[..., None]
        rl = np.linalg.norm(rays, axis=-1); dirs = rays / rl[..., None]
        if mirror:
            P = P * np.array([1, -1, 1], np.float32); dirs = dirs * np.array([1, -1, 1], np.float32)
        alb = A[fid]; n = N[fid]; mat = M[fid]
        nl = (n * L).sum(-1); ndl = np.clip(nl, 0, 1)
        ndl = np.where(mat == 2, lerp(ndl, np.clip(nl * 0.5 + 0.5, 0, 1) ** 2, 0.4), ndl)
        Pb = P + n * 0.004
        sh = None
        for oc, zb, bias in shadows:           # near cascade first, far as fallback
            s_, inb = shadow_lookup(oc, zb, Pb, bias, taps=1)
            sh = s_ if sh is None else np.where(done, sh, s_)
            done = inb if sh is s_ else (done | inb)
        direct = env['sun_light'] * (ndl * sh)[..., None]
        amb = lerp(env['amb_ground'], env['amb_sky'], (n[..., 1] * 0.5 + 0.5)[..., None])
        col = alb * (direct + amb) + alb * (E[fid] * env['emis'])[..., None]
        # warm point lights (night only), each evaluated only inside its screen window
        for (lp, lc, ls, lr), (px, py, pz) in zip(lights, lproj):
            if pz <= 0.02: continue
            rad = lr * 3.2 * cam.fl / pz
            a0 = int(max(0, py - rad - y0)); a1 = int(min(y1 - y0, py + rad - y0)); b0 = int(max(0, px - rad)); b1 = int(min(W, px + rad))
            if a1 <= a0 or b1 <= b0: continue
            dv = np.asarray(lp, np.float32) - P[a0:a1, b0:b1]; d = np.linalg.norm(dv, axis=-1) + 1e-6
            att = ls / (1 + (d / (lr * 0.28)) ** 2) * smooth(lr * 3.2, lr * 1.2, d)
            wrapl = np.clip((n[a0:a1, b0:b1] * dv).sum(-1) / d, -0.3, 1) * 0.7 + 0.3
            col[a0:a1, b0:b1] += alb[a0:a1, b0:b1] * (np.asarray(lc, np.float32) * 2.2) * (att * wrapl)[..., None]
        # water: turquoise by depth + mirrored reflection + sun glitter
        wm = (mat == 1) & valid
        if refl is not None and wm.any():
            r_ = np.hypot(P[..., 0], P[..., 2]); th = np.arctan2(P[..., 2], P[..., 0]); t = r_ / S.lake_r(th)
            wc = lerp(env['water_deep'], env['water_shallow'], (smooth(0.50, 1.0, t) ** 1.6)[..., None]) * env['water_light']
            wc = wc * (0.80 + 0.20 * sh)[..., None]
            cosv = np.clip(-dirs[..., 1], 0, 1)
            k = np.clip(0.03 + 0.97 * (1 - cosv) ** 3.2, 0, env['refl_max'])
            n1 = fbm(P[..., 0] * 30, P[..., 2] * 30, 2, 5) - 0.5; n2 = fbm(P[..., 0] * 11 + 9, P[..., 2] * 11, 2, 8) - 0.5
            amp = np.minimum(0.006 * cam.fl / np.maximum(dp, 0.05), cam.H / 260.0)
            yy, xx = np.mgrid[y0:y1, 0:W]
            rx = np.clip(xx + n1 * amp * 1.6, 0, W - 1).astype(np.float32); ry = np.clip(yy + (n2 * amp * 2.4), 0, H - 1).astype(np.float32)
            rf = cv2.remap(refl, rx, ry, cv2.INTER_LINEAR) * env['refl_tint']        # smooth (bilinear) reflection lookup
            cw = lerp(wc, rf, k[..., None])
            nw = np.stack([n1 * 0.22 + n2 * 0.10, np.ones_like(n1), n2 * 0.22 - n1 * 0.08], -1); nw /= np.linalg.norm(nw, axis=-1, keepdims=True)
            Vd = -dirs; Rv = 2 * (nw * Vd).sum(-1, keepdims=True) * nw - Vd
            spec = np.clip((Rv * L).sum(-1), 0, 1) ** env['spec_p'] * env['spec_s']
            cw = cw + env['sun_col'] * spec[..., None]
            foam = smooth(0.972, 0.997, t) * 0.38
            cw = lerp(cw, (env['amb_sky'] + env['sun_light'] * 0.25) * 0.95, foam[..., None])
            col = np.where(wm[..., None], cw, col)
        # distance + height fog, tinted by the sky toward that direction
        dist = dp * rl
        fd = dirs.copy(); fd[..., 1] = 0.035; fd /= np.linalg.norm(fd, axis=-1, keepdims=True)
        fcol = sky(fd, env, disc=False) * env.get('fog_tint', 0.78)
        f = 1 - np.exp(-(dist * env['fog_d']) * np.exp(-np.maximum(P[..., 1], 0) * env['fog_h']))
        f = np.clip(f, 0, env['fog_max'])
        col = lerp(col, fcol, f[..., None])
        sk = sky(dirs, env)
        if env.get('bg') is not None and not mirror:     # screen-space backdrop for the floating diorama
            sk = env['bg'][y0:y1]
        if stars is not None:
            sk = sk + stars[y0:y1] * smooth(-0.02, 0.10, dirs[..., 1])[..., None]
            mw = np.exp(-((dirs @ MW_N.astype(np.float32)) ** 2) / 0.030) * (0.35 + 0.65 * fbm(dirs[..., 0] * 5, dirs[..., 2] * 5 + dirs[..., 1] * 3, 3, 12))
            sk = sk + c3(0.050, 0.060, 0.105) * (mw * smooth(0.0, 0.25, dirs[..., 1]))[..., None]
        out[y0:y1] = np.where(valid[..., None], col, sk)
    return out

def render(scene, world, eye, target, fov, W, H, env, ss=2, focus=None, near_r=0.9, refl_scale=0.5, face_mask=None, log=True, shift=(0.0, 0.0)):
    t0 = time.time(); Wr, Hr = W * ss, H * ss
    def mk(w_, h_):
        c_ = Camera(eye, target, fov, w_, h_); c_.cx = w_ * (0.5 + shift[0]); c_.cy = h_ * (0.5 + shift[1]); return c_
    cam = mk(Wr, Hr)
    ldir = env['sun']
    shadows = []
    if focus is not None:
        oc, zb = shadow_map(scene, ldir, focus, near_r, 2600); shadows.append((oc, zb, 0.004))
    oc, zb = shadow_map(scene, ldir, (0, 0.2, 0), 3.1, 2600); shadows.append((oc, zb, 0.014))
    if log: print('  shadows', round(time.time() - t0, 1), flush=True)
    # mirrored pass for the lake reflection (no water, no underside)
    M = scene['M']; rm = (M != 1) & (M != 5) & (M != 3)
    camr = mk(int(Wr * refl_scale), int(Hr * refl_scale))
    idr, dr = render_ids(scene, camr, mirror=True, face_mask=rm)
    st_r = star_layer(camr, True, max(1, int(ss * refl_scale))) if env['night'] else None
    refl = shade(scene, camr, env, idr, dr, shadows[-1:], mirror=True, stars=st_r)
    refl = cv2.GaussianBlur(refl, (0, 0), 1.2 * ss * refl_scale)
    refl = cv2.resize(refl, (Wr, Hr), interpolation=cv2.INTER_LINEAR)
    if log: print('  reflection', round(time.time() - t0, 1), flush=True)
    idb, dp = render_ids(scene, cam, face_mask=face_mask)
    if log: print('  raster', round(time.time() - t0, 1), flush=True)
    st = star_layer(cam, False, ss) if env['night'] else None
    hdr = shade(scene, cam, env, idb, dp, shadows, refl=refl, stars=st)
    hdr = bloom(hdr, thresh=1.6 if not env['night'] else 1.15, strength=0.30 if not env['night'] else 0.62,
                sizes=(4 * ss + 1, 14 * ss + 1, 40 * ss + 1))
    img = tonemap(hdr, env['exposure'])
    img = cv2.resize(img, (W, H), interpolation=cv2.INTER_AREA)
    if log: print('  shaded', round(time.time() - t0, 1), flush=True)
    return img, mk(W, H)

def finish(img, grain=0.012, vig=0.22, seed=1):
    """Gentle grade: lifted teal shadows, warm highlights, vignette, film grain."""
    H, W = img.shape[:2]
    lum = img.mean(2, keepdims=True)
    img = img + (1 - lum) ** 3 * np.array([-0.004, 0.006, 0.014], np.float32) + lum ** 3 * np.array([0.012, 0.004, -0.010], np.float32)
    g_ = img.mean(2, keepdims=True); img = g_ + (img - g_) * 1.14
    img = np.clip((img - 0.5) * 1.08 + 0.5, 0, 1)
    yy, xx = np.mgrid[0:H, 0:W]; r = np.hypot((xx - W / 2) / (W / 2), (yy - H / 2) / (H / 2))
    img = img * (1 - vig * smooth(0.55, 1.45, r))[..., None]
    rng = np.random.default_rng(seed); img = img + rng.normal(0, grain, (H, W, 1)).astype(np.float32)
    return np.clip(img, 0, 1)

def save(img, path, q=90):
    cv2.imwrite(path, (img[..., ::-1] * 255 + 0.5).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, q])

def birds(img, pts, size=1.0):
    """A few distant birds as tiny dark chevrons."""
    u8 = (img * 255).astype(np.uint8).copy()
    for (x, y, s) in pts:
        s = s * size
        p = np.array([[x - 7 * s, y - 2 * s], [x - 3 * s, y - 4 * s], [x, y], [x + 3 * s, y - 4.4 * s], [x + 7.5 * s, y - 1.5 * s]], np.int32)
        cv2.polylines(u8, [p], False, (48, 42, 52), max(1, int(round(1.3 * s))), cv2.LINE_AA)
    return u8.astype(np.float32) / 255

def corridor(eye, vd, right, length=0.5, half=0.09):
    """Points along the view axis that must stay free of trees."""
    pts = []
    for d in np.arange(0.0, length + 0.01, 0.08):
        for sgn in (-1, 0, 1):
            pts.append(eye + vd * d + right * sgn * half * (0.5 + d))
    return pts

# ---------------- camera set-ups ----------------
def shot(name, mode, scale=1.0):
    night = mode == 'night'
    markers = {}
    if name.startswith('diorama'):
        portrait = name == 'dioramap'
        w = S.build(hiker_deg=-80, skirt=True); sc = S.finalize(w)
        W, H = ((780, 1688) if portrait else (2160, 1350)); W = int(W * scale); H = int(H * scale)
        env = env_night(215, 46) if night else env_day(186, 27)
        env['fog_d'] = 0.006; env['fog_max'] = 0.2; env['refl_max'] = 0.20
        if not night: env['sun_light'] = env['sun_light'] * 0.82; env['exposure'] = 0.86
        # soft vertical backdrop behind the floating island
        ss = 2; yy = np.linspace(0, 1, H * ss, dtype=np.float32)[:, None, None]
        if night: top, mid, bot = c3(0.010, 0.020, 0.052), c3(0.030, 0.066, 0.125), c3(0.055, 0.105, 0.165)
        else: top, mid, bot = c3(0.14, 0.42, 0.60), c3(0.90, 0.78, 0.66), c3(1.0, 0.62, 0.48)
        g = lerp(lerp(top, mid, smooth(0.0, 0.55, yy)), bot, smooth(0.5, 1.0, yy))
        bg = np.broadcast_to(g, (H * ss, W * ss, 3)).astype(np.float32).copy()
        if night:      # screen-space star field behind the island, denser toward the top
            rs = np.random.default_rng(11); st = np.zeros((H * ss, W * ss, 3), np.float32)
            for _ in range(int(900 * W * H / (780 * 1688))):
                yq = rs.random() ** 1.7; mg = rs.random() ** 4
                cv2.circle(st, (int(rs.random() * W * ss), int(yq * H * ss * 0.92)), max(1, int(round((0.5 + 1.4 * mg) * ss * 0.75))),
                           (float(0.3 + 2.4 * mg),) * 3, -1, cv2.LINE_AA)
            bg += cv2.GaussianBlur(st, (3, 3), 0) * 1.2 + cv2.GaussianBlur(st, (17, 17), 0) * 0.8
        env['bg'] = bg
        if portrait:
            eye = np.array([0.0, 5.9, -11.8]); fov = 44; shift = (0.0, -0.085)
        else:
            eye = np.array([0.0, 3.5, -7.2]); fov = 36; shift = (0.15, -0.01)
        img, cam = render(sc, w, eye, (0, -0.10, 0.25), fov, W, H, env, ss=ss, shift=shift)
        if night:      # stars behind the island
            pass
    elif name.startswith('walk'):
        portrait = name in ('walkp', 'campp', 'dioramap')
        hd = -13.0
        w = S.build(hiker_deg=hd, skirt=False)
        out, tan = w.frame(hd); hp = w.hiker_pos
        W, H = ((780, 1688) if portrait else (2160, 1350)); W = int(W * scale); H = int(H * scale)
        to_far = norm((w.at(112, 1.0) - hp) * [1, 0, 1])
        k = 0.50 if portrait else 0.40
        vd = norm(tan * (1 - k) + to_far * k); right = np.cross([0, 1.0, 0], vd)   # look between the trail ahead and the far shore
        if portrait:
            eye = hp - vd * 0.225 + right * 0.004 + [0, 0.112, 0]; tgt = hp + vd * 1.0 + [0, 0.20, 0]; fov = 64
        else:
            eye = hp - vd * 0.27 - right * 0.03 + [0, 0.125, 0]; tgt = hp + vd * 1.0 - right * 0.10 + [0, 0.085, 0]; fov = 50
        env = env_night(150, 40) if night else env_day(172, 22)
        sc = S.finalize(w, clear=corridor(eye, vd, right))
        img, cam = render(sc, w, eye, tgt, fov, W, H, env, focus=hp)
        if not night:
            img = birds(img, [(W * 0.22, H * 0.20, W / 780 * (1.0 if portrait else 0.5)), (W * 0.30, H * 0.17, W / 780 * (0.7 if portrait else 0.35)), (W * 0.17, H * 0.235, W / 780 * (0.6 if portrait else 0.3))])
    elif name.startswith('dock'):
        portrait = name == 'dockp'
        dg = 135.0
        w0 = S.World.__new__(S.World)                       # (frame helper only)
        out = np.array([math.cos(dg * D2R), 0, math.sin(dg * D2R)]); tan = np.array([-out[2], 0, out[0]])
        w = S.build(hiker_deg=dg, hiker_t=1.0, hiker_shift=tuple(-out * 0.185 + tan * 0.004), hiker_y=0.015,
                    hiker_heading=math.radians(dg + 180 + 6), hiker_stride=0.1, skirt=False)
        a = w.at(dg, 1.0); b = a - out * 0.24
        W, H = ((780, 1688) if portrait else (2160, 1350)); W = int(W * scale); H = int(H * scale)
        if portrait:      # low camera on the shore; horizon a third from the top, a sheet covers the lower half
            eye = a + out * 0.075 + tan * 0.014 + [0, 0.034, 0]; fov = 62; shift = (0.0, -0.16)
        else:             # dock and hiker left of centre: a panel covers the right third
            eye = a + out * 0.10 - tan * 0.03 + [0, 0.040, 0]; fov = 40; shift = (-0.14, 0.07)
        tgt = b - out * 1.0 + [0, eye[1] - 0.0, 0]; tgt[1] = eye[1]
        vd = norm((tgt - eye) * [1, 0, 1]); right = np.cross([0, 1.0, 0], vd)
        env = env_night(dg + 180 + (9 if portrait else 15), 12.5) if night else env_day(dg + 180 + 12, 14)
        if night: env['sun_light'] = env['sun_light'] * 0.9; env['spec_s'] = 2.2; env['spec_p'] = 420.0
        sc = S.finalize(w, clear=corridor(eye, vd, right, 0.2))
        img, cam = render(sc, w, eye, tgt, fov, W, H, env, focus=b, shift=shift)
        markers['dock_end'] = [round(v, 4) for v in cam.project_point(b + [0, 0.02, 0])]
    elif name == 'vista':
        hd = -112.0
        w = S.build(hiker_deg=hd, hiker_t=1.045, hiker_heading=math.radians(74), hiker_stride=0.1, skirt=False)
        W, H = int(2400 * scale), int(1200 * scale)
        hp = w.hiker_pos
        vd = norm((w.at(96, 1.0) - hp) * [1, 0, 1]); right = np.cross([0, 1.0, 0], vd)
        eye = hp - vd * 0.50 + right * 0.10; eye[1] = max(hp[1] + 0.115, w.ground(eye[0], eye[2]) + 0.05)
        tgt = eye + vd + [0, 0.065, 0]
        env = env_night(118, 34) if night else env_day(101, 24)
        sc = S.finalize(w, clear=corridor(eye, vd, right, 0.65, 0.12))
        img, cam = render(sc, w, eye, tgt, 48, W, H, env, focus=hp)
        if not night:
            img = birds(img, [(W * 0.70, H * 0.16, W / 2400 * 1.5), (W * 0.735, H * 0.13, W / 2400 * 1.1), (W * 0.675, H * 0.185, W / 2400 * 1.0)])
    else:
        raise SystemExit('unknown shot')
    for nm, p in w.prop_pos.items():
        x, y, z = cam.project_point(p); markers['prop_' + nm] = [round(x / cam.W, 4), round(y / cam.H, 4), round(z, 3)]
    for nm, p in w.stop_pos.items():
        x, y, z = cam.project_point(p + [0, 0.02, 0]); markers[nm] = [round(x / cam.W, 4), round(y / cam.H, 4), round(z, 3)]
    x, y, z = cam.project_point(w.hiker_pos + [0, 0.05, 0]); markers['hiker'] = [round(x / cam.W, 4), round(y / cam.H, 4), round(z, 3)]
    img = finish(img)
    return img, markers

if __name__ == '__main__':
    name, mode = sys.argv[1], sys.argv[2]; scale = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0
    t0 = time.time(); img, mk = shot(name, mode, scale)
    path = f'out/{name}_{mode}{"" if scale == 1 else "_prev"}.jpg'; save(img, path)
    json.dump(mk, open(f'out/{name}_{mode}.json', 'w'))
    print(path, img.shape, round(time.time() - t0, 1), 's'); print(json.dumps(mk))
