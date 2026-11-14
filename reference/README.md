# Reference pack for the Lake Loop portfolio

Design reference only. Nothing in this folder ships with the site.
Read PLAN.md in the repo root first.

## frames/  (the visual target)

Rendered style frames of the 3D world. Match their layout, colour and mood.

| File | Shows | Used by screen |
| --- | --- | --- |
| landing-island-day-desktop.jpg | Whole island, day, 2160x1350 | Landing-Desktop |
| landing-island-night-desktop.jpg | Whole island, night, 2160x1350 | (night look of the landing) |
| landing-island-day-phone.jpg | Whole island, day, 780x1688 | Main (phone landing) |
| map-island-night-phone.jpg | Whole island, night, 780x1688 | Lake-Map-Phone |
| walk-day-desktop.jpg | Hiker on the trail near the Lookout | Lake-Walk-Desktop |
| walk-day-phone.jpg | Same, portrait | Lake-Walk-Phone |
| dock-night-desktop.jpg | Hiker on the Dock at night | Lake-Stop-Desktop |
| dock-night-phone.jpg | Same, portrait | Lake-Stop-Phone |
| vista-day-wide.jpg | Wide lake view, 2400x1200 | Highlights hero still, share image |

## screens/  (the interface design)

HTML source of the nine designed screens, exported from the design canvas.
They are not runnable pages: they use the canvas's own component runtime.
Read them for exact markup, sizes, inline styles and copy.

- canvas.json lists every screen with its width and height.
- Image tags point at /_blob/<id> addresses that only work inside the canvas.
  Map them to frames/ like this:

| Blob id starts with | Frame |
| --- | --- |
| 585af963 | landing-island-day-phone.jpg |
| f99a60e0 | map-island-night-phone.jpg |
| 9dcb21ba | landing-island-day-desktop.jpg |
| 6ef6eec5 | walk-day-phone.jpg |
| b62f99f2 | walk-day-desktop.jpg |
| f77cbeac | dock-night-phone.jpg |
| 1668ef81 | dock-night-desktop.jpg |
| 979bf618 | vista-day-wide.jpg |

- Highlights.dc.html is one fluid page. Highlights-Phone.dc.html just mounts it
  at 390 px wide.

## scene/  (the world layout)

The Python scripts that built and rendered the frames. Port the layout from
them; do not ship or run them in the site.

- scene.py: lake shape, terrain, peaks, trail, the seven stops and their props,
  trees, lanterns, hiker, animals. STOPS at the top gives each stop's angle.
- shots.py: day and night light settings (env_day, env_night), water shading,
  and the camera set-up for each frame (function shot).
- core.py: the small software renderer and shape helpers the other two use.

To re-render a frame (optional): pip install numpy scipy opencv-python, then
`mkdir out && python3 shots.py walk day 0.5` from inside scene/.
Shot names: diorama, dioramap, walk, walkp, dock, dockp, vista. Modes: day, night.

Note: the frames are fully faceted and the hiker is made of boxes. The site
should be "low-poly, but softer" as described in PLAN.md.
